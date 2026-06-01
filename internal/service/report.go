package service

import (
	"time"

	"github.com/obeej/akin/internal/repository"
)

// TransparencyReport — the monthly public report.
// All figures are aggregated. No individual is identifiable.
// Bucket rule: any figure derived from fewer than 10 people is suppressed.
type TransparencyReport struct {
	PeriodStart      time.Time `json:"periodStart"`
	PeriodEnd        time.Time `json:"periodEnd"`
	GeneratedAt      time.Time `json:"generatedAt"`

	// Cash rail
	TotalRaisedKobo  int64 `json:"totalRaisedKobo"`
	TotalGivers      int64 `json:"totalGivers"`
	TotalDisbursedKobo int64 `json:"totalDisbursedKobo"`
	ActiveRecipients int64 `json:"activeRecipients"`

	// Ride rail
	TripsCompleted   int64   `json:"tripsCompleted"`
	SeatsDonated     int64   `json:"seatsDonated"`
	UniqueDrivers    int64   `json:"uniqueDrivers"`
	UniqueCommuters  int64   `json:"uniqueCommuters"`

	// Attendance + retention
	AttendanceRate   *float64 `json:"attendanceRate,omitempty"` // nil if bucket < 10
	// VerifiedAttendances — confirmed-present attendances in the period. This is
	// the giver-facing "your money is working" figure: support is only released
	// to recipients who are verified present, so this number is the human
	// outcome of the funds disbursed above.
	VerifiedAttendances int64  `json:"verifiedAttendances"`
	RetentionNote    string   `json:"retentionNote"`

	// Privacy
	BucketSuppressed bool `json:"bucketSuppressed"`
}

const reportBucketMin = 10

type ReportService struct {
	deposits   *repository.DepositRepo
	payouts    *repository.PayoutRepo
	recipients *repository.RecipientRepo
	rides      *repository.RideRepo
	attendance *repository.AttendanceRepo
	ratings    *repository.RatingRepo
	impact     *repository.DriverImpactRepo
}

func NewReportService(
	deposits *repository.DepositRepo,
	payouts *repository.PayoutRepo,
	recipients *repository.RecipientRepo,
	rides *repository.RideRepo,
	attendance *repository.AttendanceRepo,
	ratings *repository.RatingRepo,
	impact *repository.DriverImpactRepo,
) *ReportService {
	return &ReportService{
		deposits:   deposits,
		payouts:    payouts,
		recipients: recipients,
		rides:      rides,
		attendance: attendance,
		ratings:    ratings,
		impact:     impact,
	}
}

// Generate builds the report for the calendar month containing `forDate`.
func (s *ReportService) Generate(forDate time.Time) (*TransparencyReport, error) {
	start := time.Date(forDate.Year(), forDate.Month(), 1, 0, 0, 0, 0, time.UTC)
	end := start.AddDate(0, 1, 0)

	report := &TransparencyReport{
		PeriodStart: start,
		PeriodEnd:   end,
		GeneratedAt: time.Now().UTC(),
	}

	// Cash rail — deposits settled in period.
	summary, err := s.deposits.SummarySince(start)
	if err != nil {
		return nil, err
	}
	report.TotalRaisedKobo = summary.TotalKobo
	report.TotalGivers = summary.UniqueGivers

	// Payouts settled in period.
	payoutTotal, payoutCount, err := s.payouts.SummarySince(start, end)
	if err != nil {
		return nil, err
	}
	report.TotalDisbursedKobo = payoutTotal
	report.ActiveRecipients = payoutCount

	// Ride rail.
	tripsCompleted, seatsDonated, uniqueDrivers, uniqueRiders, err := s.rides.TripSummary(start, end)
	if err != nil {
		return nil, err
	}
	report.TripsCompleted = tripsCompleted
	report.SeatsDonated = seatsDonated
	report.UniqueDrivers = uniqueDrivers
	report.UniqueCommuters = uniqueRiders

	// Attendance rate — suppressed if fewer than reportBucketMin recipients.
	if report.ActiveRecipients >= reportBucketMin {
		rate, err := s.attendance.AttendanceRate(start, end)
		if err == nil {
			report.AttendanceRate = &rate
		}
		if n, err := s.attendance.AttendedCount(start, end); err == nil {
			report.VerifiedAttendances = n
		}
	} else {
		report.BucketSuppressed = true
		report.RetentionNote = "Attendance data suppressed — fewer than 10 recipients in period."
	}

	return report, nil
}
