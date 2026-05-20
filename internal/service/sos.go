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

var (
	ErrSOSNotFound    = errors.New("sos_not_found")
	ErrSOSNotOpen     = errors.New("sos_not_open")
	ErrSOSNotAcked    = errors.New("sos_not_acknowledged")
)

type SOSService struct {
	repo     *repository.SOSRepo
	rideRepo *repository.RideRepo
	notify   *NotificationService
	db       *gorm.DB
}

func NewSOSService(repo *repository.SOSRepo, rideRepo *repository.RideRepo, notify *NotificationService, db *gorm.DB) *SOSService {
	return &SOSService{repo: repo, rideRepo: rideRepo, notify: notify, db: db}
}

type TriggerSOSInput struct {
	TripID uuid.UUID
	UserID uuid.UUID
	Lat    float64
	Lng    float64
	Note   string
}

func (s *SOSService) Trigger(input TriggerSOSInput) (*models.SOSAlert, error) {
	// Verify the trip exists and is active.
	trip, err := s.rideRepo.FindTrip(input.TripID)
	if err != nil {
		return nil, ErrTripNotFound
	}
	if trip.Status != "in_transit" && trip.Status != "boarding" {
		return nil, ErrInvalidTripState
	}

	alert := &models.SOSAlert{
		TripID: input.TripID,
		UserID: input.UserID,
		Status: "open",
		Lat:    input.Lat,
		Lng:    input.Lng,
		Note:   input.Note,
	}
	if err := s.repo.Create(alert); err != nil {
		return nil, err
	}

	audit.Record(s.db, input.UserID.String(), "sos_triggered", alert.ID.String(), map[string]any{
		"tripId": input.TripID.String(),
		"lat":    input.Lat,
		"lng":    input.Lng,
	})

	// Notify all stewards — in production this would page on-call.
	// For now: system notification that stewards will see in their queue.
	_ = s.notify.Send(input.UserID, "sos_triggered",
		"SOS alert sent",
		"Your SOS has been received. A steward has been notified.",
	)

	return alert, nil
}

func (s *SOSService) Acknowledge(alertID, stewardID uuid.UUID) (*models.SOSAlert, error) {
	alert, err := s.repo.FindByID(alertID)
	if err != nil {
		return nil, ErrSOSNotFound
	}
	if alert.Status != "open" {
		return nil, ErrSOSNotOpen
	}

	now := time.Now()
	if err := s.repo.Update(alertID, map[string]any{
		"status":      "acknowledged",
		"acked_by_id": stewardID,
		"acked_at":    &now,
	}); err != nil {
		return nil, err
	}

	audit.Record(s.db, stewardID.String(), "sos_acknowledged", alertID.String(), nil)
	return s.repo.FindByID(alertID)
}

func (s *SOSService) Resolve(alertID, stewardID uuid.UUID) (*models.SOSAlert, error) {
	alert, err := s.repo.FindByID(alertID)
	if err != nil {
		return nil, ErrSOSNotFound
	}
	if alert.Status != "acknowledged" {
		return nil, ErrSOSNotAcked
	}

	now := time.Now()
	if err := s.repo.Update(alertID, map[string]any{
		"status":      "resolved",
		"resolved_at": &now,
	}); err != nil {
		return nil, err
	}

	audit.Record(s.db, stewardID.String(), "sos_resolved", alertID.String(), nil)
	return s.repo.FindByID(alertID)
}

func (s *SOSService) ListOpen() ([]models.SOSAlert, error) {
	return s.repo.ListOpen()
}
