package service

import (
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/obeej/akin/internal/audit"
	"github.com/obeej/akin/internal/models"
	"github.com/obeej/akin/internal/repository"
	"gorm.io/gorm"
)

// ErrSuspended — the user has accrued enough active strikes to be temporarily
// blocked from booking rides and from payout eligibility.
var ErrSuspended = errors.New("suspended")

// Suspension policy. This many active (un-cleared) strikes inside the trailing
// window suspends a user. Kept deliberately lenient so an honest one-off (a
// sick day, a driver mistake) never cuts someone off from transport they
// depend on — it's repeated abuse that trips it.
const (
	StrikeSuspendThreshold = 2
	StrikeWindow           = 28 * 24 * time.Hour // 4 weeks
)

// IntegrityService owns strike recording and the suspension check, so the
// threshold lives in one place and both the booking gate (RideService) and the
// payout gate (AttendanceService) agree on who is suspended.
type IntegrityService struct {
	strikes *repository.StrikeRepo
	db      *gorm.DB
}

func NewIntegrityService(strikes *repository.StrikeRepo, db *gorm.DB) *IntegrityService {
	return &IntegrityService{strikes: strikes, db: db}
}

// defaultIntegrity is the boot-wired integrity service used by the cross-cutting
// booking and payout gates (RideService.BookSeat, AttendanceService.
// EligibleForPayout, DriverService.MarkAttendance). It's a package singleton
// rather than a constructor dependency so the suspension policy can be enforced
// at those call sites without threading the service through every constructor.
// All access goes through nil-safe methods, so it's safe before SetDefaultIntegrity
// is called (e.g. in unit tests that never wire it).
var defaultIntegrity *IntegrityService

// SetDefaultIntegrity wires the package-level integrity service. Call once at startup.
func SetDefaultIntegrity(i *IntegrityService) { defaultIntegrity = i }

// RecordRideNoShow logs a strike for a rider who didn't board a seat they
// booked. A strike write must never block the driver's attendance marking, so
// callers treat the error as non-fatal (the event is also audited).
func (s *IntegrityService) RecordRideNoShow(userID, tripID uuid.UUID) error {
	if s == nil || s.strikes == nil {
		return nil
	}
	st := &models.Strike{
		UserID:    userID,
		Reason:    models.StrikeRideNoShow,
		TripID:    &tripID,
		WeekStart: models.WeekStartOf(time.Now()),
		Note:      "Did not board a booked seat",
	}
	if err := s.strikes.Create(st); err != nil {
		return err
	}
	audit.Record(s.db, "system", "strike_recorded", userID.String(), map[string]any{
		"reason": models.StrikeRideNoShow,
		"tripId": tripID.String(),
	})
	return nil
}

// IsSuspended reports whether the user currently has enough active strikes to
// be suspended. Nil-safe so wiring can leave it unset in tests.
func (s *IntegrityService) IsSuspended(userID uuid.UUID) (bool, error) {
	if s == nil || s.strikes == nil {
		return false, nil
	}
	n, err := s.strikes.ActiveCount(userID, time.Now().Add(-StrikeWindow))
	if err != nil {
		return false, err
	}
	return n >= StrikeSuspendThreshold, nil
}

// ListActive returns the steward review queue: un-cleared strikes in the
// trailing window, newest first.
func (s *IntegrityService) ListActive() ([]models.Strike, error) {
	if s == nil || s.strikes == nil {
		return nil, nil
	}
	return s.strikes.ListActive(time.Now().Add(-StrikeWindow))
}

// Clear resolves a strike (e.g. after a successful appeal).
func (s *IntegrityService) Clear(strikeID, stewardID uuid.UUID, reason string) error {
	if s == nil || s.strikes == nil {
		return nil
	}
	if err := s.strikes.Clear(strikeID, stewardID, reason); err != nil {
		return err
	}
	audit.Record(s.db, stewardID.String(), "strike_cleared", strikeID.String(), map[string]any{
		"reason": reason,
	})
	return nil
}
