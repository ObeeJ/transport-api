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
	ErrAlreadyAppliedDriver  = errors.New("driver_application_exists")
	ErrDriverNotFound        = errors.New("driver_not_found")
	ErrDriverNotApproved     = errors.New("driver_not_approved")
	ErrAttendanceExists      = errors.New("attendance_already_marked")
	ErrInvalidVehicleType    = errors.New("invalid_vehicle_type")
	ErrInvalidAttendanceStatus = errors.New("invalid_attendance_status")
)

var validVehicleTypes = map[string]bool{"car": true, "bus": true, "minivan": true}
var validAttendanceStatuses = map[string]bool{"boarded": true, "no_show": true}

type DriverService struct {
	repo      *repository.DriverRepo
	stewards  *repository.StewardRepo
	rideRepo  *repository.RideRepo
	notify    *NotificationService
	db        *gorm.DB
}

func NewDriverService(
	repo *repository.DriverRepo,
	stewards *repository.StewardRepo,
	rideRepo *repository.RideRepo,
	notify *NotificationService,
	db *gorm.DB,
) *DriverService {
	return &DriverService{repo: repo, stewards: stewards, rideRepo: rideRepo, notify: notify, db: db}
}

type ApplyDriverInput struct {
	UserID        uuid.UUID
	VehicleType   string
	VehiclePlate  string
	LicenseNumber string
	Note          string
}

func (s *DriverService) Apply(input ApplyDriverInput) (*models.DriverProfile, error) {
	if !validVehicleTypes[input.VehicleType] {
		return nil, ErrInvalidVehicleType
	}
	// Idempotent — return existing if already applied.
	if existing, err := s.repo.FindByUserID(input.UserID); err == nil {
		return existing, nil
	}

	d := &models.DriverProfile{
		UserID:        input.UserID,
		Status:        "pending",
		VehicleType:   input.VehicleType,
		VehiclePlate:  input.VehiclePlate,
		LicenseNumber: input.LicenseNumber,
		Note:          input.Note,
	}
	if err := s.repo.Create(d); err != nil {
		return nil, err
	}
	audit.Record(s.db, input.UserID.String(), "driver_applied", d.ID.String(), map[string]any{
		"vehicleType": d.VehicleType,
	})
	return d, nil
}

func (s *DriverService) GetByUserID(userID uuid.UUID) (*models.DriverProfile, error) {
	d, err := s.repo.FindByUserID(userID)
	if err != nil {
		return nil, ErrDriverNotFound
	}
	return d, nil
}

func (s *DriverService) ListPending() ([]models.DriverProfile, error) {
	return s.repo.ListPending()
}

type DecideDriverInput struct {
	DriverProfileID uuid.UUID
	StewardID       uuid.UUID
	Decision        string // approve | decline
	Note            string
}

type DecideDriverResult struct {
	Profile      *models.DriverProfile
	Transitioned bool
	SignoffsSoFar int
}

// Decide applies the same two-person rule as recipient decisions.
func (s *DriverService) Decide(input DecideDriverInput) (*DecideDriverResult, error) {
	if input.Decision != "approve" && input.Decision != "decline" {
		return nil, ErrInvalidDecision
	}

	d, err := s.repo.FindByID(input.DriverProfileID)
	if err != nil {
		return nil, ErrDriverNotFound
	}
	if d.Status != "pending" {
		return nil, ErrAlreadyDecided
	}
	if d.UserID == input.StewardID {
		return nil, ErrSelfReview
	}
	if _, err := s.stewards.FindActionByStewardAndSubject(input.StewardID, d.ID, "driver"); err == nil {
		return nil, ErrAlreadyRecorded
	}

	action := &models.StewardAction{
		StewardID:   input.StewardID,
		SubjectType: "driver",
		SubjectID:   d.ID,
		Decision:    input.Decision,
		Note:        input.Note,
	}
	if err := s.stewards.CreateAction(action); err != nil {
		return nil, err
	}

	matching, _ := s.stewards.ListActionsBySubjectAndDecision(d.ID, "driver", input.Decision)
	unique := uniqueStewardActions(matching)
	result := &DecideDriverResult{Profile: d, SignoffsSoFar: len(unique)}

	if len(unique) >= 2 {
		now := time.Now()
		newStatus := map[string]string{"approve": "approved", "decline": "declined"}[input.Decision]
		if err := s.repo.UpdateStatus(d.ID, map[string]any{"status": newStatus, "decided_at": &now}); err != nil {
			return nil, err
		}
		result.Transitioned = true
		result.Profile.Status = newStatus

		_ = s.notify.Send(d.UserID, "driver_"+newStatus,
			map[string]string{"approved": "You're approved to drive", "declined": "Driver application update"}[newStatus],
			map[string]string{
				"approved": "Your driver application has been approved. You can now publish trips.",
				"declined": "Your driver application was not approved at this time.",
			}[newStatus],
		)
		audit.Record(s.db, input.StewardID.String(), "driver_"+newStatus, d.ID.String(), map[string]any{
			"stewardActions": len(unique),
		})
	}

	return result, nil
}

// MarkAttendance — driver marks each booked rider as boarded or no_show.
type MarkAttendanceInput struct {
	BookingID uuid.UUID
	TripID    uuid.UUID
	RiderID   uuid.UUID
	DriverID  uuid.UUID
	Status    string // boarded | no_show
}

func (s *DriverService) MarkAttendance(input MarkAttendanceInput) (*models.TripAttendance, error) {
	if !validAttendanceStatuses[input.Status] {
		return nil, ErrInvalidAttendanceStatus
	}
	// Verify the trip belongs to this driver.
	trip, err := s.rideRepo.FindTrip(input.TripID)
	if err != nil || trip.DriverID != input.DriverID {
		return nil, ErrNotYourTrip
	}
	// Idempotent.
	if existing, err := s.repo.FindTripAttendance(input.BookingID); err == nil {
		return existing, nil
	}

	a := &models.TripAttendance{
		BookingID: input.BookingID,
		TripID:    input.TripID,
		RiderID:   input.RiderID,
		Status:    input.Status,
		MarkedAt:  time.Now(),
	}
	if err := s.repo.CreateTripAttendance(a); err != nil {
		return nil, err
	}
	audit.Record(s.db, input.DriverID.String(), "attendance_marked", a.ID.String(), map[string]any{
		"status": input.Status,
	})
	return a, nil
}
