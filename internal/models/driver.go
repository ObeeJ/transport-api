package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// DriverProfile — a user who has applied to drive on the platform.
// Stewards review and approve/decline using the same two-person rule
// as recipient applications. Status: pending | approved | declined.
type DriverProfile struct {
	ID               uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	UserID           uuid.UUID  `gorm:"type:uuid;uniqueIndex;not null" json:"-"`
	Status           string     `gorm:"not null;default:pending;index" json:"status"` // pending | approved | declined
	VehicleType      string     `gorm:"not null" json:"vehicleType"`                  // car | bus | minivan
	VehiclePlate     string     `gorm:"not null" json:"vehiclePlate"`
	LicenseNumber    string     `gorm:"not null" json:"licenseNumber"`
	Note             string     `gorm:"type:text" json:"note,omitempty"`
	CreatedAt        time.Time  `json:"createdAt"`
	UpdatedAt        time.Time  `json:"updatedAt"`
	DecidedAt        *time.Time `json:"decidedAt,omitempty"`
}

func (d *DriverProfile) BeforeCreate(_ *gorm.DB) error {
	if d.ID == uuid.Nil {
		d.ID = uuid.New()
	}
	return nil
}
