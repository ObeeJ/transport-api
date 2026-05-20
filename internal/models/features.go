package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// TripRating — two-way rating after a completed trip.
// Rater is the person giving the rating; Subject is who is being rated.
// Score 1–5. Append-only.
type TripRating struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	TripID    uuid.UUID `gorm:"type:uuid;index;not null" json:"tripId"`
	RaterID   uuid.UUID `gorm:"type:uuid;index;not null" json:"-"`
	SubjectID uuid.UUID `gorm:"type:uuid;index;not null" json:"-"`
	Role      string    `gorm:"not null;index" json:"role"` // driver_rating | rider_rating
	Score     int       `gorm:"not null" json:"score"`      // 1–5
	Note      string    `gorm:"type:text" json:"note,omitempty"`
	CreatedAt time.Time `gorm:"index" json:"createdAt"`
}

func (r *TripRating) BeforeCreate(_ *gorm.DB) error {
	if r.ID == uuid.Nil {
		r.ID = uuid.New()
	}
	return nil
}

func (r *TripRating) BeforeUpdate(_ *gorm.DB) error { return ErrAuditImmutable }
func (r *TripRating) BeforeDelete(_ *gorm.DB) error { return ErrAuditImmutable }

// DriverImpact — running tally of a driver's in-kind contributions.
// One row per driver, updated after each completed trip.
// SeatsTotal and KmTotal are denormalized for fast reads on the profile page.
type DriverImpact struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	UserID      uuid.UUID `gorm:"type:uuid;uniqueIndex;not null" json:"userId"`
	SeatsTotal  int64     `gorm:"not null;default:0" json:"seatsTotal"`
	TripsTotal  int64     `gorm:"not null;default:0" json:"tripsTotal"`
	KmTotal     float64   `gorm:"not null;default:0" json:"kmTotal"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

func (d *DriverImpact) BeforeCreate(_ *gorm.DB) error {
	if d.ID == uuid.Nil {
		d.ID = uuid.New()
	}
	return nil
}

// EncouragementNote — anonymous note from a giver to the recipient pool.
// Never attributed. Shown as a generic feed to approved recipients.
// Body is the only user-supplied field; all others are system-set.
type EncouragementNote struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	GiverID   uuid.UUID `gorm:"type:uuid;index;not null" json:"-"` // never exposed
	Body      string    `gorm:"type:text;not null" json:"body"`
	Active    bool      `gorm:"not null;default:true;index" json:"active"`
	CreatedAt time.Time `gorm:"index" json:"createdAt"`
}

func (e *EncouragementNote) BeforeCreate(_ *gorm.DB) error {
	if e.ID == uuid.Nil {
		e.ID = uuid.New()
	}
	return nil
}

// SOSAlert — triggered by a rider during an active trip.
// Alerts stewards immediately. Records trip state at time of trigger.
// Status: open | acknowledged | resolved
type SOSAlert struct {
	ID           uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	TripID       uuid.UUID  `gorm:"type:uuid;index;not null" json:"tripId"`
	UserID       uuid.UUID  `gorm:"type:uuid;index;not null" json:"-"`
	Status       string     `gorm:"not null;default:open;index" json:"status"` // open | acknowledged | resolved
	Lat          float64    `gorm:"" json:"lat,omitempty"`
	Lng          float64    `gorm:"" json:"lng,omitempty"`
	Note         string     `gorm:"type:text" json:"note,omitempty"`
	AckedByID    *uuid.UUID `gorm:"type:uuid;index" json:"-"`
	AckedAt      *time.Time `json:"ackedAt,omitempty"`
	ResolvedAt   *time.Time `json:"resolvedAt,omitempty"`
	CreatedAt    time.Time  `gorm:"index" json:"createdAt"`
}

func (s *SOSAlert) BeforeCreate(_ *gorm.DB) error {
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	return nil
}

// TripGPSPoint — a single GPS breadcrumb during an active trip.
// Used for plausibility checks and incident reconstruction.
// Append-only. High volume — partitioned by trip_id in production.
type TripGPSPoint struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	TripID    uuid.UUID `gorm:"type:uuid;index;not null" json:"tripId"`
	UserID    uuid.UUID `gorm:"type:uuid;index;not null" json:"-"`
	Lat       float64   `gorm:"not null" json:"lat"`
	Lng       float64   `gorm:"not null" json:"lng"`
	Accuracy  float64   `gorm:"" json:"accuracy,omitempty"` // metres
	RecordedAt time.Time `gorm:"index;not null" json:"recordedAt"`
	CreatedAt  time.Time `json:"createdAt"`
}

func (g *TripGPSPoint) BeforeCreate(_ *gorm.DB) error {
	if g.ID == uuid.Nil {
		g.ID = uuid.New()
	}
	return nil
}

func (g *TripGPSPoint) BeforeUpdate(_ *gorm.DB) error { return ErrAuditImmutable }
func (g *TripGPSPoint) BeforeDelete(_ *gorm.DB) error { return ErrAuditImmutable }

// RecipientAppeal — a recipient challenges a declined or capped decision.
// Must be reviewed by a different steward pair than the one who decided.
// Status: open | under_review | upheld | dismissed
type RecipientAppeal struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	RecipientID uuid.UUID  `gorm:"type:uuid;index;not null" json:"recipientId"`
	Reason      string     `gorm:"type:text;not null" json:"reason"`
	Status      string     `gorm:"not null;default:open;index" json:"status"`
	ReviewedBy  *uuid.UUID `gorm:"type:uuid;index" json:"-"`
	ReviewNote  string     `gorm:"type:text" json:"reviewNote,omitempty"`
	CreatedAt   time.Time  `gorm:"index" json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
	ResolvedAt  *time.Time `json:"resolvedAt,omitempty"`
}

func (a *RecipientAppeal) BeforeCreate(_ *gorm.DB) error {
	if a.ID == uuid.Nil {
		a.ID = uuid.New()
	}
	return nil
}
