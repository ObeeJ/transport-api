// Package sponsor manages recurring auto-debit sponsorships.
package sponsor

import (
	"log/slog"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type RecurringSponsor struct {
	ID                  uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	UserID              uuid.UUID  `gorm:"type:uuid;not null" json:"userId"`
	AmountKobo          int64      `gorm:"not null" json:"amountKobo"`
	Cadence             string     `gorm:"not null" json:"cadence"` // weekly | monthly
	PaystackAuthCode    string     `gorm:"not null" json:"-"`
	Status              string     `gorm:"not null;default:active" json:"status"`
	NextChargeAt        time.Time  `gorm:"not null" json:"nextChargeAt"`
	LastChargeAt        *time.Time `json:"lastChargeAt,omitempty"`
	LastChargeStatus    *string    `json:"lastChargeStatus,omitempty"`
	ConsecutiveFailures int        `gorm:"not null;default:0" json:"-"`
	PausedUntil         *time.Time `json:"pausedUntil,omitempty"`
	CreatedAt           time.Time  `json:"createdAt"`
}

func (RecurringSponsor) TableName() string { return "recurring_sponsors" }

func (r *RecurringSponsor) BeforeCreate(_ *gorm.DB) error {
	if r.ID == uuid.Nil {
		r.ID = uuid.New()
	}
	return nil
}

// Create sets up a new recurring sponsorship.
func Create(db *gorm.DB, userID uuid.UUID, amountKobo int64, cadence, authCode string) (*RecurringSponsor, error) {
	nextCharge := time.Now().Add(7 * 24 * time.Hour)
	if cadence == "monthly" {
		nextCharge = time.Now().Add(30 * 24 * time.Hour)
	}
	r := &RecurringSponsor{
		UserID:           userID,
		AmountKobo:       amountKobo,
		Cadence:          cadence,
		PaystackAuthCode: authCode,
		Status:           "active",
		NextChargeAt:     nextCharge,
	}
	return r, db.Create(r).Error
}

// Cancel deactivates a recurring sponsorship.
func Cancel(db *gorm.DB, id, userID uuid.UUID) error {
	return db.Model(&RecurringSponsor{}).
		Where("id = ? AND user_id = ?", id, userID).
		Update("status", "cancelled").Error
}

// DueCharges returns sponsors due for charging.
func DueCharges(db *gorm.DB) ([]RecurringSponsor, error) {
	var items []RecurringSponsor
	return items, db.Where("status = 'active' AND next_charge_at <= ? AND (paused_until IS NULL OR paused_until < ?)",
		time.Now(), time.Now()).Find(&items).Error
}

// MarkCharged updates the sponsor after a successful charge.
func MarkCharged(db *gorm.DB, id uuid.UUID, cadence string) error {
	next := time.Now().Add(7 * 24 * time.Hour)
	if cadence == "monthly" {
		next = time.Now().Add(30 * 24 * time.Hour)
	}
	status := "success"
	return db.Model(&RecurringSponsor{}).Where("id = ?", id).Updates(map[string]any{
		"last_charge_at":       time.Now(),
		"last_charge_status":   status,
		"next_charge_at":       next,
		"consecutive_failures": 0,
	}).Error
}

// MarkFailed increments failure count and pauses if threshold exceeded.
func MarkFailed(db *gorm.DB, id uuid.UUID) error {
	var r RecurringSponsor
	if err := db.Where("id = ?", id).First(&r).Error; err != nil {
		return err
	}
	failures := r.ConsecutiveFailures + 1
	updates := map[string]any{
		"consecutive_failures": failures,
		"last_charge_status":   "failed",
	}
	if failures >= 3 {
		paused := time.Now().Add(7 * 24 * time.Hour)
		updates["paused_until"] = paused
		slog.Warn("sponsor: paused after 3 failures", "id", id)
	}
	return db.Model(&RecurringSponsor{}).Where("id = ?", id).Updates(updates).Error
}
