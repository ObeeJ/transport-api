package service

import (
	"crypto/sha256"
	"encoding/csv"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"strings"

	"github.com/google/uuid"
	"github.com/obeej/akin/internal/audit"
	"github.com/obeej/akin/internal/models"
	"github.com/obeej/akin/internal/repository"
	"gorm.io/gorm"
)

var (
	ErrStudentIDAlreadyUsed = errors.New("student_id_already_used")
	ErrStudentIDNotVerified = errors.New("student_id_not_verified")
	ErrRosterEntryNotFound  = errors.New("roster_entry_not_found")
)

// rosterSalt is mixed into the hash so a raw SHA-256 of the student ID
// cannot be reversed by brute-force against a known ID space.
// In production this should come from config/env.
const rosterSalt = "akin_roster_v1"

type RosterService struct {
	repo  *repository.RosterRepo
	users *repository.UserRepo
	db    *gorm.DB
}

func NewRosterService(repo *repository.RosterRepo, users *repository.UserRepo, db *gorm.DB) *RosterService {
	return &RosterService{repo: repo, users: users, db: db}
}

// Verify hashes the student ID and checks it hasn't been used by another
// account. If clean, creates a RosterEntry linking the hash to userID.
// Idempotent — calling again for the same user returns the existing entry.
func (s *RosterService) Verify(userID uuid.UUID, rawStudentID string) (*models.RosterEntry, error) {
	// Idempotent — already verified.
	if existing, err := s.repo.FindByUserID(userID); err == nil {
		return existing, nil
	}

	hash := hashStudentID(rawStudentID)

	// One-student-one-account: reject if this hash is already claimed.
	if _, err := s.repo.FindByHash(hash); err == nil {
		audit.Record(s.db, userID.String(), "roster_duplicate_attempt", "system", map[string]any{
			"hash": hash[:8] + "...", // log prefix only, never the full hash
		})
		return nil, ErrStudentIDAlreadyUsed
	}

	entry := &models.RosterEntry{
		UserID:   userID,
		IDHash:   hash,
		HashAlgo: "sha256_v1",
		Verified: true,
	}
	if err := s.repo.Create(entry); err != nil {
		return nil, err
	}

	audit.Record(s.db, userID.String(), "roster_verified", entry.ID.String(), nil)
	return entry, nil
}

// IsVerified returns true if the user has a verified roster entry.
func (s *RosterService) IsVerified(userID uuid.UUID) bool {
	_, err := s.repo.FindByUserID(userID)
	return err == nil
}

func hashStudentID(raw string) string {
	h := sha256.Sum256([]byte(fmt.Sprintf("%s:%s", rosterSalt, raw)))
	return hex.EncodeToString(h[:])
}

// BulkImportCSV — steward uploads a CSV of `email,studentId` rows.
// For each row: look up the user by email and, if found, pre-verify them
// against the hashed student ID. The user then no longer needs to visit
// /support/verify — they can apply for support directly.
type BulkImportResult struct {
	Rows         int      `json:"rows"`
	Verified     int      `json:"verified"`
	Skipped      int      `json:"skipped"`
	Duplicates   int      `json:"duplicates"`
	UnknownEmail []string `json:"unknownEmails"`
	BadRows      []string `json:"badRows"`
}

func (s *RosterService) BulkImportCSV(stewardID uuid.UUID, r io.Reader) (*BulkImportResult, error) {
	reader := csv.NewReader(r)
	reader.TrimLeadingSpace = true
	reader.FieldsPerRecord = -1

	result := &BulkImportResult{}
	first := true

	for {
		row, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
		result.Rows++
		if len(row) < 2 {
			result.BadRows = append(result.BadRows, strings.Join(row, ","))
			continue
		}
		if first {
			first = false
			if strings.EqualFold(strings.TrimSpace(row[0]), "email") {
				result.Rows--
				continue
			}
		}

		email := strings.ToLower(strings.TrimSpace(row[0]))
		studentID := strings.TrimSpace(row[1])
		if email == "" || studentID == "" {
			result.BadRows = append(result.BadRows, strings.Join(row, ","))
			continue
		}

		user, err := s.users.FindByEmail(email)
		if err != nil {
			result.UnknownEmail = append(result.UnknownEmail, email)
			result.Skipped++
			continue
		}

		// Already verified — leave alone (Verify is idempotent on user_id).
		if _, err := s.repo.FindByUserID(user.ID); err == nil {
			result.Duplicates++
			continue
		}

		hash := hashStudentID(studentID)
		// Hash collision against a DIFFERENT user is a hard error — duplicate ID.
		if existing, err := s.repo.FindByHash(hash); err == nil && existing.UserID != user.ID {
			result.Duplicates++
			audit.Record(s.db, stewardID.String(), "roster_bulk_duplicate", existing.ID.String(), map[string]any{
				"attemptedEmail": email,
			})
			continue
		}

		entry := &models.RosterEntry{
			UserID:   user.ID,
			IDHash:   hash,
			HashAlgo: "sha256_v1",
			Verified: true,
		}
		if err := s.repo.Create(entry); err != nil {
			result.BadRows = append(result.BadRows, strings.Join(row, ","))
			continue
		}
		result.Verified++
	}

	audit.Record(s.db, stewardID.String(), "roster_bulk_import", "system", map[string]any{
		"rows":       result.Rows,
		"verified":   result.Verified,
		"skipped":    result.Skipped,
		"duplicates": result.Duplicates,
		"unknown":    len(result.UnknownEmail),
	})
	return result, nil
}

// Stats — counts for the steward roster page.
type RosterStats struct {
	TotalVerified int64 `json:"totalVerified"`
}

func (s *RosterService) Stats() (*RosterStats, error) {
	n, err := s.repo.Count()
	if err != nil {
		return nil, err
	}
	return &RosterStats{TotalVerified: n}, nil
}
