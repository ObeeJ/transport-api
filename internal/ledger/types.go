package ledger

import "github.com/google/uuid"

// Account represents a wallet or pool account in the ledger.
type Account struct {
	ID uuid.UUID
}

// Entry is a single debit or credit line written to ledger_entries.
type Entry struct {
	ID           uuid.UUID
	TxnID        uuid.UUID
	AccountID    uuid.UUID
	Direction    string // "debit" | "credit"
	AmountKobo   int64
	Currency     string
	BalanceAfter int64
	Purpose      string
	Metadata     map[string]any
}
