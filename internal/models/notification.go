package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Notification — a message delivered to a user. Channel is the delivery
// mechanism used (in_app | sms | email). ReadAt nil means unread.
// The service layer writes these; a future SMS/email adapter reads them.
type Notification struct {
	ID        uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	UserID    uuid.UUID  `gorm:"type:uuid;index;not null" json:"userId"`
	Channel   string     `gorm:"not null;default:in_app;index" json:"channel"` // in_app | sms | email
	Event     string     `gorm:"not null;index" json:"event"`                  // deposit_settled | recipient_approved | trip_cancelled | ...
	Title     string     `gorm:"not null" json:"title"`
	Body      string     `gorm:"type:text;not null" json:"body"`
	ReadAt    *time.Time `gorm:"index" json:"readAt,omitempty"`
	CreatedAt time.Time  `gorm:"index" json:"createdAt"`
}

func (n *Notification) BeforeCreate(_ *gorm.DB) error {
	if n.ID == uuid.Nil {
		n.ID = uuid.New()
	}
	return nil
}
