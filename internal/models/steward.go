package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// StewardAction — append-only record of a steward's decision on a subject.
//
// Two-person rule: a Recipient (or any subject) only changes state when two
// distinct stewards have recorded matching decisions since the last state
// change. Conflict resolution lives in the handler, not here — this table
// is just the audit-grade evidence trail.
type StewardAction struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	InstitutionID uuid.UUID `gorm:"type:uuid;index;not null;default:'00000000-0000-0000-0000-000000000001'" json:"-"`
	StewardID     uuid.UUID `gorm:"type:uuid;index;not null" json:"stewardId"`
	SubjectType   string    `gorm:"index;not null" json:"subjectType"` // "recipient" | "weekly_cap" | "payout"
	SubjectID     uuid.UUID `gorm:"type:uuid;index;not null" json:"subjectId"`
	Decision      string    `gorm:"not null" json:"decision"` // "approve" | "decline"
	WeeklyCapKobo int64     `gorm:"" json:"weeklyCapKobo,omitempty"`
	Note          string    `gorm:"type:text" json:"note,omitempty"`
	CreatedAt     time.Time `gorm:"index" json:"createdAt"`
}

func (a *StewardAction) BeforeCreate(_ *gorm.DB) error {
	if a.ID == uuid.Nil {
		a.ID = uuid.New()
	}
	return nil
}

// Append-only — mirror the AuditEntry hooks.
func (a *StewardAction) BeforeUpdate(_ *gorm.DB) error { return ErrAuditImmutable }
func (a *StewardAction) BeforeDelete(_ *gorm.DB) error { return ErrAuditImmutable }
