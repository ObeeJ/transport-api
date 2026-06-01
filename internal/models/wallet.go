package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Wallet — one per user. Balance is stored in kobo (integer, no floats).
// Never mutate balance directly — always go through WalletTransaction.
type Wallet struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	InstitutionID uuid.UUID `gorm:"type:uuid;index;not null;default:'00000000-0000-0000-0000-000000000001'" json:"-"`
	UserID        uuid.UUID `gorm:"type:uuid;uniqueIndex;not null" json:"userId"`
	BalanceKobo   int64     `gorm:"not null;default:0" json:"balanceKobo"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

func (w *Wallet) BeforeCreate(_ *gorm.DB) error {
	if w.ID == uuid.Nil {
		w.ID = uuid.New()
	}
	return nil
}

// WalletTransaction — append-only ledger entry.
// Type: credit | debit
// Ref: the source record ID (payout ID, withdrawal ID, etc.)
type WalletTransaction struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	InstitutionID uuid.UUID `gorm:"type:uuid;index;not null;default:'00000000-0000-0000-0000-000000000001'" json:"-"`
	WalletID      uuid.UUID `gorm:"type:uuid;index;not null" json:"walletId"`
	UserID        uuid.UUID `gorm:"type:uuid;index;not null" json:"userId"`
	Type        string    `gorm:"not null;index" json:"type"`        // credit | debit
	AmountKobo  int64     `gorm:"not null" json:"amountKobo"`
	BalanceKobo int64     `gorm:"not null" json:"balanceKobo"`       // balance after this tx
	Description string    `gorm:"type:text" json:"description"`
	RefID       string    `gorm:"index" json:"refId,omitempty"`      // payout_id, withdrawal_id, etc.
	CreatedAt   time.Time `gorm:"index" json:"createdAt"`
}

func (t *WalletTransaction) BeforeCreate(_ *gorm.DB) error {
	if t.ID == uuid.Nil {
		t.ID = uuid.New()
	}
	return nil
}

// Append-only — no updates or deletes on the ledger.
func (t *WalletTransaction) BeforeUpdate(_ *gorm.DB) error { return ErrAuditImmutable }
func (t *WalletTransaction) BeforeDelete(_ *gorm.DB) error { return ErrAuditImmutable }
