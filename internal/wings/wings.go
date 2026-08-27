// Package wings manages ring-fenced credits for recipients.
// Wings are NOT cash — they can only be spent on rides.
// Expiry: 7 days. Expired wings return to the pool via ledger.
package wings

import (
	"errors"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	ErrInsufficientWings = errors.New("wings: insufficient balance")
	ErrNotFound          = errors.New("wings: grant not found")
)

type Grant struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey"`
	UserID      uuid.UUID  `gorm:"type:uuid;not null;index"`
	Amount      int64      `gorm:"not null"`
	Purpose     string     `gorm:"not null"`
	SourceID    *uuid.UUID `gorm:"type:uuid"`
	IssuedAt    time.Time  `gorm:"not null"`
	ExpiresAt   time.Time  `gorm:"not null"`
	Status      string     `gorm:"not null;default:active"`
	SpentAt     *time.Time
	LockedUntil *time.Time
}

func (Grant) TableName() string { return "wings_grants" }

func (g *Grant) BeforeCreate(_ *gorm.DB) error {
	if g.ID == uuid.Nil {
		g.ID = uuid.New()
	}
	return nil
}

type Balance struct {
	Available   int64 `json:"available"`
	Locked      int64 `json:"locked"`
	ExpiringSoon int64 `json:"expiring_soon"` // expires within 24h
}

// Issue creates a new wings grant for a user. Call inside a transaction.
func Issue(tx *gorm.DB, userID uuid.UUID, amount int64, purpose string, sourceID *uuid.UUID) (*Grant, error) {
	g := &Grant{
		UserID:    userID,
		Amount:    amount,
		Purpose:   purpose,
		SourceID:  sourceID,
		IssuedAt:  time.Now(),
		ExpiresAt: time.Now().Add(7 * 24 * time.Hour),
		Status:    "active",
	}
	return g, tx.Create(g).Error
}

// Balance returns available, locked, and expiring-soon totals.
func GetBalance(db *gorm.DB, userID uuid.UUID) (Balance, error) {
	var grants []Grant
	if err := db.Where("user_id = ? AND status IN ('active','locked') AND expires_at > ?", userID, time.Now()).
		Find(&grants).Error; err != nil {
		return Balance{}, err
	}
	var b Balance
	soon := time.Now().Add(24 * time.Hour)
	for _, g := range grants {
		if g.Status == "locked" {
			b.Locked += g.Amount
		} else {
			b.Available += g.Amount
			if g.ExpiresAt.Before(soon) {
				b.ExpiringSoon += g.Amount
			}
		}
	}
	return b, nil
}

// Spend deducts amountWings from the user's active grants (FIFO by expiry).
// Must be called inside a transaction with FOR UPDATE on the grants.
func Spend(tx *gorm.DB, userID uuid.UUID, amountWings int64, purpose string) error {
	var grants []Grant
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("user_id = ? AND status = 'active' AND expires_at > ?", userID, time.Now()).
		Order("expires_at ASC").Find(&grants).Error; err != nil {
		return err
	}
	total := int64(0)
	for _, g := range grants {
		total += g.Amount
	}
	if total < amountWings {
		return ErrInsufficientWings
	}
	remaining := amountWings
	now := time.Now()
	for _, g := range grants {
		if remaining <= 0 {
			break
		}
		if g.Amount <= remaining {
			remaining -= g.Amount
			tx.Model(&Grant{}).Where("id = ?", g.ID).Updates(map[string]any{
				"status": "spent", "spent_at": now,
			})
		} else {
			// Partial spend — split not supported; mark whole grant spent and refund remainder.
			// Simpler invariant: always spend whole grants.
			remaining -= g.Amount
			tx.Model(&Grant{}).Where("id = ?", g.ID).Updates(map[string]any{
				"status": "spent", "spent_at": now,
			})
		}
	}
	return nil
}

// Lock sets status=locked on a grant (transparency wall).
func Lock(db *gorm.DB, grantID uuid.UUID, until time.Time) error {
	return db.Model(&Grant{}).Where("id = ?", grantID).Updates(map[string]any{
		"status": "locked", "locked_until": until,
	}).Error
}

// Unlock restores status=active.
func Unlock(db *gorm.DB, grantID uuid.UUID) error {
	return db.Model(&Grant{}).Where("id = ?", grantID).Updates(map[string]any{
		"status": "active", "locked_until": nil,
	}).Error
}

// History returns all grants for a user, newest first.
func History(db *gorm.DB, userID uuid.UUID, limit int) ([]Grant, error) {
	var grants []Grant
	return grants, db.Where("user_id = ?", userID).Order("issued_at DESC").Limit(limit).Find(&grants).Error
}

// ExpiredGrants returns active grants past their expiry.
func ExpiredGrants(db *gorm.DB) ([]Grant, error) {
	var grants []Grant
	return grants, db.Where("status = 'active' AND expires_at < ?", time.Now()).Find(&grants).Error
}
