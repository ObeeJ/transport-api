package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Attendance — whether a given user attended class in a given week.
//
// Tracked per-user (not per-recipient) because attendance is a class-wide
// signal. The recipient flow consults it at payout time; givers and
// drivers never see it. WeekStart is the Monday of the ISO week, UTC.
type Attendance struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	UserID    uuid.UUID `gorm:"type:uuid;index;not null;uniqueIndex:attendance_unique_week" json:"userId"`
	WeekStart time.Time `gorm:"type:date;not null;index;uniqueIndex:attendance_unique_week" json:"weekStart"`
	Attended  bool      `gorm:"not null;default:false" json:"attended"`
	Source    string    `gorm:"not null;default:csv" json:"source"` // csv | qr (future)
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (a *Attendance) BeforeCreate(_ *gorm.DB) error {
	if a.ID == uuid.Nil {
		a.ID = uuid.New()
	}
	return nil
}

// WeekStartOf — Monday 00:00 UTC of the ISO week containing t.
func WeekStartOf(t time.Time) time.Time {
	utc := t.UTC()
	// Go's Weekday() has Sunday = 0, Monday = 1 ... we want Monday as the start.
	wd := int(utc.Weekday())
	if wd == 0 {
		wd = 7
	}
	monday := utc.AddDate(0, 0, -(wd - 1))
	return time.Date(monday.Year(), monday.Month(), monday.Day(), 0, 0, 0, 0, time.UTC)
}
