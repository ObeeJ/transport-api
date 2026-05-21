package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Hub — a curated, safe pickup location. Trips originate from a hub
// (hub → campus) so riders pool at known, well-lit spots. Door-to-door
// is intentionally not supported in v1 — it breaks anonymity-of-need.
type Hub struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	InstitutionID uuid.UUID `gorm:"type:uuid;index;not null;default:'00000000-0000-0000-0000-000000000000'" json:"institutionId"`
	Name          string    `gorm:"uniqueIndex;not null" json:"name"`
	Lat       float64   `gorm:"" json:"lat,omitempty"`
	Lng       float64   `gorm:"" json:"lng,omitempty"`
	Active    bool      `gorm:"not null;default:true;index" json:"active"`
	CreatedAt time.Time `json:"createdAt"`
}

func (h *Hub) BeforeCreate(_ *gorm.DB) error {
	if h.ID == uuid.Nil {
		h.ID = uuid.New()
	}
	return nil
}

// Trip — a single seat-donation by a driver. Status lifecycle:
//
//	published → boarding → in_transit → completed
//	     ↓
//	  cancelled (terminal)
//
// Drivers receive no money — this is in-kind giving.
type Trip struct {
	ID            uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	InstitutionID uuid.UUID  `gorm:"type:uuid;index;not null;default:'00000000-0000-0000-0000-000000000000'" json:"institutionId"`
	DriverID      uuid.UUID  `gorm:"type:uuid;index;not null" json:"driverId"`
	OriginHubID   uuid.UUID  `gorm:"type:uuid;index;not null" json:"originHubId"`
	Destination   string     `gorm:"not null" json:"destination"`
	DepartureAt   time.Time  `gorm:"index;not null" json:"departureAt"`
	TotalSeats    int        `gorm:"not null" json:"totalSeats"`
	Status        string     `gorm:"not null;default:published;index" json:"status"`
	VehiclePlate  string     `gorm:"" json:"vehiclePlate,omitempty"`
	StartedAt     *time.Time `json:"startedAt,omitempty"`
	CompletedAt   *time.Time `json:"completedAt,omitempty"`
	CancelledAt   *time.Time `json:"cancelledAt,omitempty"`
	CancelReason  string     `gorm:"type:text" json:"cancelReason,omitempty"`
	CreatedAt     time.Time  `json:"createdAt"`
	UpdatedAt     time.Time  `json:"updatedAt"`
}

func (t *Trip) BeforeCreate(_ *gorm.DB) error {
	if t.ID == uuid.Nil {
		t.ID = uuid.New()
	}
	return nil
}

// Booking — a single rider on a single trip. One row per (trip, rider).
// Active bookings count against TotalSeats; cancelled rows don't.
type Booking struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	TripID      uuid.UUID  `gorm:"type:uuid;index;not null" json:"tripId"`
	RiderID     uuid.UUID  `gorm:"type:uuid;index;not null" json:"riderId"`
	Status      string     `gorm:"not null;default:booked;index" json:"status"` // booked | cancelled | boarded | no_show | completed
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
	CancelledAt *time.Time `json:"cancelledAt,omitempty"`
}

func (b *Booking) BeforeCreate(_ *gorm.DB) error {
	if b.ID == uuid.Nil {
		b.ID = uuid.New()
	}
	return nil
}
