package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// RecipientBankAccount — bank account a recipient has registered for
// payouts. Resolved through Paystack so we know the AccountName actually
// matches the number. Stored at most one per recipient for v1.
type RecipientBankAccount struct {
	ID                     uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	RecipientID            uuid.UUID `gorm:"type:uuid;uniqueIndex;not null" json:"recipientId"`
	BankCode               string    `gorm:"not null" json:"bankCode"`
	BankName               string    `gorm:"not null" json:"bankName"`
	AccountNumber          string    `gorm:"not null" json:"accountNumber"`
	AccountName            string    `gorm:"not null" json:"accountName"`
	PaystackRecipientCode  string    `gorm:"not null" json:"paystackRecipientCode"`
	CreatedAt              time.Time `json:"createdAt"`
	UpdatedAt              time.Time `json:"updatedAt"`
}

func (b *RecipientBankAccount) BeforeCreate(_ *gorm.DB) error {
	if b.ID == uuid.Nil {
		b.ID = uuid.New()
	}
	return nil
}

// Payout — a disbursement from the pool to a specific recipient.
//
// Lifecycle:
//   awaiting_confirm  — one steward initiated, waiting on the second sign-off
//   pending           — second steward confirmed, Paystack accepted the transfer
//   succeeded         — Paystack delivered (via transfer.success webhook OR direct verify)
//   failed | reversed — Paystack told us so
type Payout struct {
	ID                   uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	BatchID              *uuid.UUID `gorm:"type:uuid;index" json:"batchId,omitempty"`
	RecipientID          uuid.UUID  `gorm:"type:uuid;index;not null" json:"recipientId"`
	AmountKobo         int64      `gorm:"not null" json:"amountKobo"`
	Status             string     `gorm:"not null;default:awaiting_confirm;index" json:"status"`
	Reference          string     `gorm:"uniqueIndex;not null" json:"reference"`
	PaystackTransferCode string   `gorm:"" json:"paystackTransferCode,omitempty"`
	InitiatedByID      uuid.UUID  `gorm:"type:uuid;index;not null" json:"initiatedById"`
	ConfirmedByID      *uuid.UUID `gorm:"type:uuid;index" json:"confirmedById,omitempty"`
	FailureReason      string     `gorm:"type:text" json:"failureReason,omitempty"`
	CreatedAt          time.Time  `json:"createdAt"`
	UpdatedAt          time.Time  `json:"updatedAt"`
	SettledAt          *time.Time `json:"settledAt,omitempty"`
}

func (p *Payout) BeforeCreate(_ *gorm.DB) error {
	if p.ID == uuid.Nil {
		p.ID = uuid.New()
	}
	return nil
}
