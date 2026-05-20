package repository

import (
	"time"

	"github.com/google/uuid"
	"github.com/obeej/akin/internal/models"
	"gorm.io/gorm"
)

type DriverRepo struct{ db *gorm.DB }

func NewDriverRepo(db *gorm.DB) *DriverRepo { return &DriverRepo{db} }

func (r *DriverRepo) Create(d *models.DriverProfile) error {
	return r.db.Create(d).Error
}

func (r *DriverRepo) FindByUserID(userID uuid.UUID) (*models.DriverProfile, error) {
	var d models.DriverProfile
	return &d, r.db.Where("user_id = ?", userID).First(&d).Error
}

func (r *DriverRepo) FindByID(id uuid.UUID) (*models.DriverProfile, error) {
	var d models.DriverProfile
	return &d, r.db.First(&d, "id = ?", id).Error
}

func (r *DriverRepo) ListPending() ([]models.DriverProfile, error) {
	var items []models.DriverProfile
	return items, r.db.Where("status = ?", "pending").Order("created_at asc").Find(&items).Error
}

func (r *DriverRepo) UpdateStatus(id uuid.UUID, updates map[string]any) error {
	return r.db.Model(&models.DriverProfile{}).Where("id = ?", id).Updates(updates).Error
}

// Attendance

func (r *DriverRepo) CreateTripAttendance(a *models.TripAttendance) error {
	return r.db.Create(a).Error
}

func (r *DriverRepo) FindTripAttendance(bookingID uuid.UUID) (*models.TripAttendance, error) {
	var a models.TripAttendance
	return &a, r.db.Where("booking_id = ?", bookingID).First(&a).Error
}

func (r *DriverRepo) ListTripAttendance(tripID uuid.UUID) ([]models.TripAttendance, error) {
	var items []models.TripAttendance
	return items, r.db.Where("trip_id = ?", tripID).Find(&items).Error
}

// BoardedInWindow — did this rider board any trip whose completed_at
// falls in [from, to)? Used by the combined attendance gate so that a
// student who rode an Akin trip counts as "attended" without the steward
// having to upload a CSV row for them.
func (r *DriverRepo) BoardedInWindow(riderID uuid.UUID, from, to time.Time) (bool, error) {
	var count int64
	err := r.db.Model(&models.TripAttendance{}).
		Joins("JOIN trips ON trips.id = trip_attendances.trip_id").
		Where("trip_attendances.rider_id = ?", riderID).
		Where("trip_attendances.status = ?", "boarded").
		Where("trips.completed_at >= ? AND trips.completed_at < ?", from, to).
		Count(&count).Error
	return count > 0, err
}
