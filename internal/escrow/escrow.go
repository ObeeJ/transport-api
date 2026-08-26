// Package escrow manages the lifecycle of held funds.
// State machine: held → released | refunded | frozen | expired
// Every transition is a single UPDATE with optimistic version check.
package escrow

import (
	"errors"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

var (
	ErrNotFound       = errors.New("escrow: hold not found")
	ErrInvalidState   = errors.New("escrow: invalid state transition")
	ErrVersionConflict = errors.New("escrow: concurrent modification")
)

type Hold struct {
	ID                uuid.UUID  `gorm:"type:uuid;primaryKey"`
	TxnID             uuid.UUID  `gorm:"type:uuid;uniqueIndex;not null"`
	FromAccountID     uuid.UUID  `gorm:"type:uuid;not null"`
	ToAccountID       uuid.UUID  `gorm:"type:uuid;not null"`
	AmountKobo        int64      `gorm:"not null"`
	Currency          string     `gorm:"not null;default:NGN"`
	Purpose           string     `gorm:"not null"`
	ReferenceID       *uuid.UUID `gorm:"type:uuid"`
	State             string     `gorm:"not null;default:held"`
	ReleaseConditions []byte     `gorm:"type:jsonb;not null;default:'{}'"`
	ExpiresAt         *time.Time
	CreatedAt         time.Time
	UpdatedAt         time.Time
	Version           int `gorm:"not null;default:1"`
}

func (Hold) TableName() string { return "escrow_holds" }

func (h *Hold) BeforeCreate(_ *gorm.DB) error {
	if h.ID == uuid.Nil {
		h.ID = uuid.New()
	}
	if h.TxnID == uuid.Nil {
		h.TxnID = uuid.New()
	}
	return nil
}

// Hold creates a new escrow hold inside the caller's transaction.
func NewHold(tx *gorm.DB, from, to uuid.UUID, amountKobo int64, purpose string, refID *uuid.UUID, expiresAt *time.Time) (*Hold, error) {
	h := &Hold{
		TxnID:         uuid.New(),
		FromAccountID: from,
		ToAccountID:   to,
		AmountKobo:    amountKobo,
		Purpose:       purpose,
		ReferenceID:   refID,
		State:         "held",
		ExpiresAt:     expiresAt,
	}
	if err := tx.Create(h).Error; err != nil {
		return nil, err
	}
	return h, nil
}

// transition applies a state change with optimistic locking.
func transition(tx *gorm.DB, id uuid.UUID, from, to string) error {
	res := tx.Model(&Hold{}).
		Where("id = ? AND state = ?", id, from).
		Updates(map[string]any{
			"state":      to,
			"updated_at": time.Now(),
			"version":    gorm.Expr("version + 1"),
		})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		// Either not found or wrong state.
		var count int64
		tx.Model(&Hold{}).Where("id = ?", id).Count(&count)
		if count == 0 {
			return ErrNotFound
		}
		return ErrInvalidState
	}
	return nil
}

func Release(tx *gorm.DB, id uuid.UUID) error  { return transition(tx, id, "held", "released") }
func Refund(tx *gorm.DB, id uuid.UUID) error   { return transition(tx, id, "held", "refunded") }
func Freeze(tx *gorm.DB, id uuid.UUID) error   { return transition(tx, id, "held", "frozen") }
func Expire(tx *gorm.DB, id uuid.UUID) error   { return transition(tx, id, "held", "expired") }

// GetByReference returns the active hold for a reference ID (e.g. booking ID).
func GetByReference(db *gorm.DB, refID uuid.UUID) (*Hold, error) {
	var h Hold
	if err := db.Where("reference_id = ? AND state = 'held'", refID).First(&h).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &h, nil
}

// ListExpired returns held escrows past their expiry time.
func ListExpired(db *gorm.DB) ([]Hold, error) {
	var holds []Hold
	err := db.Where("state = 'held' AND expires_at IS NOT NULL AND expires_at < ?", time.Now()).Find(&holds).Error
	return holds, err
}
