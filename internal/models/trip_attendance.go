package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// TripAttendance — records whether a booked rider actually boarded a trip.
// Marked by the driver at departure. Used for trust scoring later.
// Status: boarded | no_show
type TripAttendance struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	InstitutionID uuid.UUID `gorm:"type:uuid;index;not null;default:'00000000-0000-0000-0000-000000000001'" json:"-"`
	BookingID     uuid.UUID `gorm:"type:uuid;uniqueIndex;not null" json:"bookingId"`
	TripID    uuid.UUID `gorm:"type:uuid;index;not null" json:"tripId"`
	RiderID   uuid.UUID `gorm:"type:uuid;index;not null" json:"riderId"`
	Status    string    `gorm:"not null;index" json:"status"` // boarded | no_show
	MarkedAt  time.Time `gorm:"index" json:"markedAt"`
	CreatedAt time.Time `json:"createdAt"`
}

func (a *TripAttendance) BeforeCreate(_ *gorm.DB) error {
	if a.ID == uuid.Nil {
		a.ID = uuid.New()
	}
	return nil
}
