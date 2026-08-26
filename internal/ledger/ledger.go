// Package ledger enforces double-entry bookkeeping.
// Every kobo movement produces exactly two rows: one debit, one credit.
// The invariant: sum(debits) == sum(credits) across any txn_id.
package ledger

import (
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

var ErrNegativeAmount = errors.New("ledger: amount must be positive")

// dbEntry mirrors the ledger_entries table (raw SQL, not GORM model, to keep
// the ledger package independent of the models package).
type dbEntry struct {
	ID           uuid.UUID       `gorm:"column:id"`
	TxnID        uuid.UUID       `gorm:"column:txn_id"`
	AccountID    uuid.UUID       `gorm:"column:account_id"`
	Direction    string          `gorm:"column:direction"`
	AmountKobo   int64           `gorm:"column:amount_kobo"`
	Currency     string          `gorm:"column:currency"`
	BalanceAfter int64           `gorm:"column:balance_after"`
	Purpose      string          `gorm:"column:purpose"`
	Metadata     json.RawMessage `gorm:"column:metadata;type:jsonb"`
	CreatedAt    time.Time       `gorm:"column:created_at"`
}

func (dbEntry) TableName() string { return "ledger_entries" }

// Write atomically records a balanced debit+credit pair inside the caller's
// transaction. The caller MUST pass a *gorm.DB that is already inside a
// db.Transaction() block with a FOR UPDATE lock on both wallets.
//
// balanceAfterDebit and balanceAfterCredit are the post-write balances the
// caller has already computed (and locked via SELECT … FOR UPDATE).
func Write(
	tx *gorm.DB,
	txnID uuid.UUID,
	debitAccount, creditAccount Account,
	amountKobo int64,
	purpose string,
	balanceAfterDebit, balanceAfterCredit int64,
	metadata map[string]any,
) error {
	if amountKobo <= 0 {
		return ErrNegativeAmount
	}
	if metadata == nil {
		metadata = map[string]any{}
	}
	raw, err := json.Marshal(metadata)
	if err != nil {
		return fmt.Errorf("ledger: marshal metadata: %w", err)
	}

	entries := []dbEntry{
		{
			ID:           uuid.New(),
			TxnID:        txnID,
			AccountID:    debitAccount.ID,
			Direction:    "debit",
			AmountKobo:   amountKobo,
			Currency:     "NGN",
			BalanceAfter: balanceAfterDebit,
			Purpose:      purpose,
			Metadata:     raw,
			CreatedAt:    time.Now(),
		},
		{
			ID:           uuid.New(),
			TxnID:        txnID,
			AccountID:    creditAccount.ID,
			Direction:    "credit",
			AmountKobo:   amountKobo,
			Currency:     "NGN",
			BalanceAfter: balanceAfterCredit,
			Purpose:      purpose,
			Metadata:     raw,
			CreatedAt:    time.Now(),
		},
	}

	return tx.Create(&entries).Error
}
