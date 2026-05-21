package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Recipient — a user who has applied to receive support from the pool.
//
// The link to User is 1:1. The PseudonymousID (e.g. "R-7421") is what
// stewards see in the queue; the underlying user identity is only resolved
// at disbursement time. This separation is what gives the recipient
// anonymity-of-need across the steward review process.
type Recipient struct {
	ID                   uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	InstitutionID        uuid.UUID  `gorm:"type:uuid;index;not null;default:'00000000-0000-0000-0000-000000000000'" json:"institutionId"`
	UserID               uuid.UUID  `gorm:"type:uuid;uniqueIndex;not null" json:"-"`
	PseudonymousID       string     `gorm:"uniqueIndex;not null" json:"pseudonymousId"`
	Status               string     `gorm:"not null;default:pending;index" json:"status"`
	DisbursementMethod   string     `gorm:"not null;default:wallet" json:"disbursementMethod"`
	WeeklyCapKobo        int64      `gorm:"not null;default:0" json:"weeklyCapKobo"`
	IntakeWeeklyCostKobo int64      `gorm:"not null;default:0" json:"intakeWeeklyCostKobo"`
	IntakeSituation      string     `gorm:"type:text" json:"intakeSituation"`
	StudentIDVerified    bool       `gorm:"not null;default:false" json:"studentIdVerified"`
	AppealCount          int        `gorm:"not null;default:0" json:"appealCount"`
	CreatedAt            time.Time  `json:"createdAt"`
	UpdatedAt            time.Time  `json:"updatedAt"`
	DecidedAt            *time.Time `json:"decidedAt,omitempty"`
}

func (r *Recipient) BeforeCreate(_ *gorm.DB) error {
	if r.ID == uuid.Nil {
		r.ID = uuid.New()
	}
	return nil
}
