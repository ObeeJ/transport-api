package repository

import (
	"time"

	"github.com/google/uuid"
	"github.com/obeej/akin/internal/models"
	"gorm.io/gorm"
)

type RideRepo struct{ db *gorm.DB }

func NewRideRepo(db *gorm.DB) *RideRepo { return &RideRepo{db} }

// Hubs

func (r *RideRepo) ListActiveHubs() ([]models.Hub, error) {
	var items []models.Hub
	return items, r.db.Where("active = ?", true).Order("name asc").Find(&items).Error
}

func (r *RideRepo) FindHub(id uuid.UUID) (*models.Hub, error) {
	var h models.Hub
	return &h, r.db.First(&h, "id = ? AND active = ?", id, true).Error
}

// Trips

func (r *RideRepo) CreateTrip(t *models.Trip) error {
	return r.db.Create(t).Error
}

func (r *RideRepo) FindTrip(id uuid.UUID) (*models.Trip, error) {
	var t models.Trip
	return &t, r.db.First(&t, "id = ?", id).Error
}

func (r *RideRepo) ListUpcomingTrips(hubID *uuid.UUID) ([]models.Trip, error) {
	q := r.db.Model(&models.Trip{}).
		Where("status IN ?", []string{"published", "boarding"}).
		Where("departure_at >= ?", time.Now().Add(-30*time.Minute)).
		Order("departure_at asc")
	if hubID != nil {
		q = q.Where("origin_hub_id = ?", *hubID)
	}
	var items []models.Trip
	return items, q.Find(&items).Error
}

func (r *RideRepo) UpdateTrip(id uuid.UUID, updates map[string]any) error {
	return r.db.Model(&models.Trip{}).Where("id = ?", id).Updates(updates).Error
}

func (r *RideRepo) ListTripsByDriver(driverID uuid.UUID, limit int) ([]models.Trip, error) {
	var items []models.Trip
	return items, r.db.Where("driver_id = ?", driverID).
		Order("departure_at desc").Limit(limit).Find(&items).Error
}

func (r *RideRepo) ListTripsCursor(cursor time.Time, limit int) ([]models.Trip, error) {
	var items []models.Trip
	q := r.db.Order("created_at desc").Limit(limit)
	if !cursor.IsZero() {
		q = q.Where("created_at < ?", cursor)
	}
	return items, q.Find(&items).Error
}

// Bookings

func (r *RideRepo) CreateBooking(b *models.Booking) error {
	return r.db.Create(b).Error
}

func (r *RideRepo) FindActiveBooking(tripID, riderID uuid.UUID) (*models.Booking, error) {
	var b models.Booking
	return &b, r.db.Where("trip_id = ? AND rider_id = ? AND status = ?", tripID, riderID, "booked").
		First(&b).Error
}

func (r *RideRepo) CountActiveBookings(tripID uuid.UUID) (int64, error) {
	var count int64
	return count, r.db.Model(&models.Booking{}).
		Where("trip_id = ? AND status = ?", tripID, "booked").
		Count(&count).Error
}

func (r *RideRepo) ListActiveBookings(tripID uuid.UUID) ([]models.Booking, error) {
	var items []models.Booking
	return items, r.db.Where("trip_id = ? AND status = ?", tripID, "booked").
		Order("created_at asc").Find(&items).Error
}

func (r *RideRepo) UpdateBooking(id uuid.UUID, updates map[string]any) error {
	return r.db.Model(&models.Booking{}).Where("id = ?", id).Updates(updates).Error
}

func (r *RideRepo) CancelTripBookings(tripID uuid.UUID) error {
	now := time.Now()
	return r.db.Model(&models.Booking{}).
		Where("trip_id = ? AND status = ?", tripID, "booked").
		Updates(map[string]any{"status": "cancelled", "cancelled_at": &now}).Error
}

// CompleteTripBookings — when a driver completes a trip, roll any still-
// active bookings forward to "completed" so the rider's history is accurate.
func (r *RideRepo) CompleteTripBookings(tripID uuid.UUID) error {
	return r.db.Model(&models.Booking{}).
		Where("trip_id = ? AND status = ?", tripID, "booked").
		Update("status", "completed").Error
}

func (r *RideRepo) ListBookingsByRider(riderID uuid.UUID, limit int) ([]models.Booking, error) {
	var items []models.Booking
	return items, r.db.Where("rider_id = ?", riderID).
		Order("created_at desc").Limit(limit).Find(&items).Error
}

// BookSeatTx — capacity check + insert in one transaction.
func (r *RideRepo) BookSeatTx(trip *models.Trip, riderID uuid.UUID) (*models.Booking, error) {
	var booking models.Booking
	err := r.db.Transaction(func(tx *gorm.DB) error {
		var booked int64
		if err := tx.Model(&models.Booking{}).
			Where("trip_id = ? AND status = ?", trip.ID, "booked").
			Count(&booked).Error; err != nil {
			return err
		}
		if int(booked) >= trip.TotalSeats {
			return errTripFull
		}
		booking = models.Booking{TripID: trip.ID, RiderID: riderID, Status: "booked"}
		return tx.Create(&booking).Error
	})
	return &booking, err
}

var errTripFull = gorm.ErrRecordNotFound // sentinel — overridden below

func IsTripFull(err error) bool { return err == errTripFull }

func init() {
	// Use a distinct sentinel so callers can distinguish full vs not-found.
	errTripFull = &tripFullError{}
}

type tripFullError struct{}

func (e *tripFullError) Error() string { return "trip_full" }

// TripSummary returns aggregate ride stats for a time window.
func (r *RideRepo) TripSummary(from, to time.Time) (tripsCompleted, seatsDonated, uniqueDrivers, uniqueRiders int64, err error) {
	err = r.db.Model(&models.Trip{}).
		Where("status = ? AND completed_at >= ? AND completed_at < ?", "completed", from, to).
		Count(&tripsCompleted).Error
	if err != nil {
		return
	}
	err = r.db.Model(&models.Booking{}).
		Joins("JOIN trips ON trips.id = bookings.trip_id").
		Where("trips.status = ? AND trips.completed_at >= ? AND trips.completed_at < ?", "completed", from, to).
		Where("bookings.status IN ?", []string{"boarded", "completed"}).
		Count(&seatsDonated).Error
	if err != nil {
		return
	}
	err = r.db.Model(&models.Trip{}).
		Where("status = ? AND completed_at >= ? AND completed_at < ?", "completed", from, to).
		Distinct("driver_id").Count(&uniqueDrivers).Error
	if err != nil {
		return
	}
	err = r.db.Model(&models.Booking{}).
		Joins("JOIN trips ON trips.id = bookings.trip_id").
		Where("trips.status = ? AND trips.completed_at >= ? AND trips.completed_at < ?", "completed", from, to).
		Distinct("bookings.rider_id").Count(&uniqueRiders).Error
	return
}
