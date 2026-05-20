package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// WebhookEvent — append-only record of every webhook we've accepted.
// Used for idempotency: a unique index on (source, event_id) blocks the
// same delivery being processed twice. Paystack retries with the same
// event id on transient failures, so this matters.
type WebhookEvent struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	Source     string    `gorm:"not null;index;uniqueIndex:webhook_unique_event" json:"source"` // paystack | flutterwave | ...
	EventID    string    `gorm:"not null;uniqueIndex:webhook_unique_event" json:"eventId"`
	EventType  string    `gorm:"not null;index" json:"eventType"`
	ReceivedAt time.Time `gorm:"index" json:"receivedAt"`
}

func (w *WebhookEvent) BeforeCreate(_ *gorm.DB) error {
	if w.ID == uuid.Nil {
		w.ID = uuid.New()
	}
	return nil
}

// Append-only — webhook history is part of the audit chain.
func (w *WebhookEvent) BeforeUpdate(_ *gorm.DB) error { return ErrAuditImmutable }
func (w *WebhookEvent) BeforeDelete(_ *gorm.DB) error { return ErrAuditImmutable }
