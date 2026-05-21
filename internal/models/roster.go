package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// RosterEntry — stores the one-way hash of a student ID against a user.
// The raw student ID is NEVER stored. The hash is computed at intake and
// used only to enforce one-student-one-account. The mapping is
// access-controlled and audit-logged; unsealing requires steward action.
//
// HashAlgo is recorded so we can rotate algorithms in future without
// invalidating existing entries.
type RosterEntry struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	InstitutionID uuid.UUID `gorm:"type:uuid;index;not null;default:'00000000-0000-0000-0000-000000000000'" json:"institutionId"`
	UserID        uuid.UUID `gorm:"type:uuid;uniqueIndex;not null" json:"-"`
	IDHash    string    `gorm:"uniqueIndex;not null" json:"-"` // SHA-256(studentID + salt)
	HashAlgo  string    `gorm:"not null;default:sha256_v1" json:"-"`
	Verified  bool      `gorm:"not null;default:true" json:"verified"`
	CreatedAt time.Time `json:"createdAt"`
}

func (r *RosterEntry) BeforeCreate(_ *gorm.DB) error {
	if r.ID == uuid.Nil {
		r.ID = uuid.New()
	}
	return nil
}

// RosterEntry is append-only — the hash must never be changed after creation.
func (r *RosterEntry) BeforeUpdate(_ *gorm.DB) error { return ErrAuditImmutable }
func (r *RosterEntry) BeforeDelete(_ *gorm.DB) error { return ErrAuditImmutable }
