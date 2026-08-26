// Package outbox implements the transactional outbox pattern.
// Emit() writes an event inside the caller's DB transaction.
// The dispatcher goroutine polls and delivers events asynchronously.
package outbox

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Event struct {
	ID          uuid.UUID       `gorm:"type:uuid;primaryKey"`
	AggregateID uuid.UUID       `gorm:"type:uuid;not null"`
	EventType   string          `gorm:"not null"`
	Payload     json.RawMessage `gorm:"type:jsonb;not null"`
	Status      string          `gorm:"not null;default:pending"`
	Attempts    int             `gorm:"not null;default:0"`
	NextRetryAt time.Time       `gorm:"not null"`
	CreatedAt   time.Time
	SentAt      *time.Time
	LastError   *string
}

func (Event) TableName() string { return "outbox_events" }

func (e *Event) BeforeCreate(_ *gorm.DB) error {
	if e.ID == uuid.Nil {
		e.ID = uuid.New()
	}
	return nil
}

// Emit writes an outbox event inside the caller's transaction.
// The caller must be inside a db.Transaction() block.
func Emit(tx *gorm.DB, aggregateID uuid.UUID, eventType string, payload any) error {
	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	evt := Event{
		AggregateID: aggregateID,
		EventType:   eventType,
		Payload:     raw,
		Status:      "pending",
		NextRetryAt: time.Now(),
	}
	return tx.Create(&evt).Error
}
