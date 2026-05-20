package service

import (
	"encoding/csv"
	"errors"
	"io"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/obeej/akin/internal/audit"
	"github.com/obeej/akin/internal/models"
	"github.com/obeej/akin/internal/repository"
	"gorm.io/gorm"
)

var (
	ErrAttendanceCSVInvalid = errors.New("attendance_csv_invalid")
	ErrAttendanceMissing    = errors.New("attendance_missing")
)

type AttendanceService struct {
	repo    *repository.AttendanceRepo
	users   *repository.UserRepo
	drivers *repository.DriverRepo
	db      *gorm.DB
}

func NewAttendanceService(repo *repository.AttendanceRepo, users *repository.UserRepo, drivers *repository.DriverRepo, db *gorm.DB) *AttendanceService {
	return &AttendanceService{repo: repo, users: users, drivers: drivers, db: db}
}

// CSVUploadResult — summary returned to the steward after upload.
type CSVUploadResult struct {
	Rows         int      `json:"rows"`
	Imported     int      `json:"imported"`
	Skipped      int      `json:"skipped"`
	UnknownEmail []string `json:"unknownEmails"`
	BadRows      []string `json:"badRows"`
}

// UploadCSV — parses a steward-uploaded CSV with rows of
//
//	email,YYYY-MM-DD,attended
//
// where `attended` is one of: 1, 0, true, false, yes, no, y, n, attended, absent.
// The date can be any day of the week; we normalize to the Monday.
// Idempotent — re-uploading the same week overwrites prior rows.
func (s *AttendanceService) UploadCSV(stewardID uuid.UUID, r io.Reader) (*CSVUploadResult, error) {
	reader := csv.NewReader(r)
	reader.TrimLeadingSpace = true
	reader.FieldsPerRecord = -1

	result := &CSVUploadResult{}

	first := true
	for {
		row, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, ErrAttendanceCSVInvalid
		}
		result.Rows++
		if len(row) < 3 {
			result.BadRows = append(result.BadRows, strings.Join(row, ","))
			continue
		}
		// Skip a header row that explicitly says "email" in the first column.
		if first {
			first = false
			if strings.EqualFold(strings.TrimSpace(row[0]), "email") {
				result.Rows--
				continue
			}
		}

		email := strings.ToLower(strings.TrimSpace(row[0]))
		dateStr := strings.TrimSpace(row[1])
		attendedStr := strings.ToLower(strings.TrimSpace(row[2]))

		date, derr := time.Parse("2006-01-02", dateStr)
		if derr != nil {
			result.BadRows = append(result.BadRows, strings.Join(row, ","))
			continue
		}
		attended, aerr := parseAttended(attendedStr)
		if aerr != nil {
			result.BadRows = append(result.BadRows, strings.Join(row, ","))
			continue
		}

		user, err := s.users.FindByEmail(email)
		if err != nil {
			result.UnknownEmail = append(result.UnknownEmail, email)
			result.Skipped++
			continue
		}

		week := models.WeekStartOf(date)
		rec := &models.Attendance{
			UserID:    user.ID,
			WeekStart: week,
			Attended:  attended,
			Source:    "csv",
		}
		if err := s.repo.Upsert(rec); err != nil {
			result.BadRows = append(result.BadRows, strings.Join(row, ","))
			continue
		}
		result.Imported++
	}

	audit.Record(s.db, stewardID.String(), "attendance_csv_uploaded", "system", map[string]any{
		"rows":     result.Rows,
		"imported": result.Imported,
		"skipped":  result.Skipped,
		"unknown":  len(result.UnknownEmail),
	})
	return result, nil
}

func parseAttended(s string) (bool, error) {
	switch s {
	case "1", "true", "yes", "y", "attended", "present", "p":
		return true, nil
	case "0", "false", "no", "n", "absent", "a", "":
		return false, nil
	}
	return false, errors.New("invalid")
}

// ForUserSummary — last `weeks` weeks of attendance, oldest→newest.
// Missing weeks are filled with attended=false, source="missing" so the
// frontend can render a continuous strip.
type AttendanceCell struct {
	WeekStart time.Time `json:"weekStart"`
	Attended  bool      `json:"attended"`
	Recorded  bool      `json:"recorded"` // false = no row in DB; UI can render as "unknown"
}

func (s *AttendanceService) ForUser(userID uuid.UUID, weeks int) ([]AttendanceCell, error) {
	if weeks <= 0 {
		weeks = 8
	}
	rows, err := s.repo.ForUser(userID, weeks)
	if err != nil {
		return nil, err
	}
	byWeek := make(map[time.Time]models.Attendance, len(rows))
	for _, r := range rows {
		byWeek[r.WeekStart.UTC()] = r
	}

	out := make([]AttendanceCell, 0, weeks)
	thisWeek := models.WeekStartOf(time.Now())
	for i := weeks - 1; i >= 0; i-- {
		w := thisWeek.AddDate(0, 0, -7*i)
		if rec, ok := byWeek[w]; ok {
			out = append(out, AttendanceCell{WeekStart: w, Attended: rec.Attended, Recorded: true})
		} else {
			out = append(out, AttendanceCell{WeekStart: w, Attended: false, Recorded: false})
		}
	}
	return out, nil
}

// EligibleForPayout — gate used by PayoutService.Initiate.
//
// A recipient is eligible for the *current* week's payout if EITHER source
// shows them attending the *previous* full week:
//
//  1. CSV-uploaded `attendances` row with Attended=true, OR
//  2. A `trip_attendances` row with Status="boarded" on a Ride Network
//     trip whose `completed_at` falls in the previous week.
//
// Gate fails closed when neither source confirms attendance. Stewards
// can unblock by uploading a CSV row OR by a driver marking the recipient
// boarded on a trip that lands in the relevant week.
func (s *AttendanceService) EligibleForPayout(userID uuid.UUID) error {
	thisWeek := models.WeekStartOf(time.Now())
	lastWeek := thisWeek.AddDate(0, 0, -7)

	// Source 1: CSV-uploaded attendance.
	if attended, recorded, err := s.repo.Was(userID, lastWeek); err != nil {
		return err
	} else if recorded && attended {
		return nil
	}

	// Source 2: Ride Network — did they board a trip that completed last week?
	if s.drivers != nil {
		if boarded, err := s.drivers.BoardedInWindow(userID, lastWeek, thisWeek); err != nil {
			return err
		} else if boarded {
			return nil
		}
	}

	return ErrAttendanceMissing
}
