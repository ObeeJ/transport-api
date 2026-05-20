package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// User — authenticated person on the platform. Phone is required for SOS/recovery.
// Role gates access to elevated functionality (steward console, admin tools).
// A steward who is also a member can give & ride normally; the role just unlocks /steward/*.
type User struct {
	ID                     uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	Email                  string     `gorm:"uniqueIndex;not null" json:"email"`
	FirstName              string     `gorm:"not null;default:''" json:"firstName"`
	LastName               string     `gorm:"not null;default:''" json:"lastName"`
	PhoneE164              string     `gorm:"not null" json:"phone"`
	PasswordHash           string     `gorm:"not null" json:"-"`
	Role                   string     `gorm:"not null;default:member;index" json:"role"` // member | steward | admin
	EmailVerifiedAt        *time.Time `gorm:"index" json:"emailVerifiedAt,omitempty"`
	EmailVerifyToken       string     `gorm:"index" json:"-"`
	PasswordResetToken     string     `gorm:"index" json:"-"`
	PasswordResetExpiresAt *time.Time `json:"-"`
	CreatedAt              time.Time  `json:"createdAt"`
	UpdatedAt              time.Time  `json:"updatedAt"`
}

func (u *User) IsEmailVerified() bool {
	return u.EmailVerifiedAt != nil
}

// Steward role helpers.
const (
	RoleMember  = "member"
	RoleSteward = "steward"
	RoleAdmin   = "admin"
)

func (u *User) IsSteward() bool {
	return u.Role == RoleSteward || u.Role == RoleAdmin
}

func (u *User) BeforeCreate(_ *gorm.DB) error {
	if u.ID == uuid.Nil {
		u.ID = uuid.New()
	}
	return nil
}

// Session — server-side session. The opaque token in the cookie is hashed before storage.
type Session struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	UserID     uuid.UUID `gorm:"type:uuid;index;not null" json:"userId"`
	TokenHash  string    `gorm:"uniqueIndex;not null" json:"-"`
	ExpiresAt  time.Time `gorm:"index;not null" json:"expiresAt"`
	CreatedAt  time.Time `json:"createdAt"`
	LastSeenAt time.Time `json:"lastSeenAt"`
}

func (s *Session) BeforeCreate(_ *gorm.DB) error {
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	return nil
}

// GiverDeposit — one giver contribution to the pool. Lifecycle: pending -> succeeded | failed.
type GiverDeposit struct {
	ID                uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	UserID            uuid.UUID  `gorm:"type:uuid;index;not null" json:"userId"`
	AmountKobo        int64      `gorm:"not null" json:"amountKobo"`
	Currency          string     `gorm:"not null;default:NGN" json:"currency"`
	Frequency         string     `gorm:"not null;default:once" json:"frequency"` // once | weekly | monthly
	Status            string     `gorm:"not null;default:pending;index" json:"status"`
	PaystackReference string     `gorm:"uniqueIndex;not null" json:"paystackReference"`
	AuthorizationURL  string     `gorm:"" json:"authorizationUrl,omitempty"`
	CreatedAt         time.Time  `json:"createdAt"`
	SettledAt         *time.Time `json:"settledAt,omitempty"`
}

func (d *GiverDeposit) BeforeCreate(_ *gorm.DB) error {
	if d.ID == uuid.Nil {
		d.ID = uuid.New()
	}
	return nil
}

// AuditEntry — append-only. Never updated, never deleted.
type AuditEntry struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	Actor     string    `gorm:"index;not null" json:"actor"` // user UUID, or "system"
	Action    string    `gorm:"index;not null" json:"action"`
	Subject   string    `gorm:"index" json:"subject"`
	Metadata  *string   `gorm:"type:jsonb" json:"metadata,omitempty"`
	CreatedAt time.Time `gorm:"index" json:"createdAt"`
}

func (a *AuditEntry) BeforeCreate(_ *gorm.DB) error {
	if a.ID == uuid.Nil {
		a.ID = uuid.New()
	}
	return nil
}

// BeforeUpdate / BeforeDelete are intentionally implemented to block mutation.
func (a *AuditEntry) BeforeUpdate(_ *gorm.DB) error {
	return ErrAuditImmutable
}

func (a *AuditEntry) BeforeDelete(_ *gorm.DB) error {
	return ErrAuditImmutable
}
