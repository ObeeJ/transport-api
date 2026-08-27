// Package transparency enforces the hard gate: no post = no spend.
// When Wings are issued, a hold is created. When the recipient posts
// acknowledging the sponsor, the hold is released.
package transparency

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Hold struct {
	UserID      uuid.UUID `gorm:"type:uuid;primaryKey" json:"userId"`
	WingsLocked int64     `gorm:"not null;default:0" json:"wingsLocked"`
	Reason      string    `gorm:"not null" json:"reason"`
	LockedAt    time.Time `json:"lockedAt"`
	ReleaseBy   time.Time `json:"releaseBy"`
}

func (Hold) TableName() string { return "transparency_holds" }

// Lock creates or updates a transparency hold for a user.
func Lock(db *gorm.DB, userID uuid.UUID, wingsAmount int64, reason string) error {
	h := Hold{
		UserID:      userID,
		WingsLocked: wingsAmount,
		Reason:      reason,
		LockedAt:    time.Now(),
		ReleaseBy:   time.Now().Add(7 * 24 * time.Hour),
	}
	return db.Save(&h).Error
}

// Release removes the transparency hold (called when post is created).
func Release(db *gorm.DB, userID uuid.UUID) error {
	return db.Delete(&Hold{}, "user_id = ?", userID).Error
}

// GetHold returns the active hold for a user, or nil.
func GetHold(db *gorm.DB, userID uuid.UUID) (*Hold, error) {
	var h Hold
	if err := db.Where("user_id = ?", userID).First(&h).Error; err != nil {
		return nil, nil
	}
	return &h, nil
}

// IsBlocked returns true if the user has an active transparency hold.
func IsBlocked(db *gorm.DB, userID uuid.UUID) bool {
	var count int64
	db.Model(&Hold{}).Where("user_id = ? AND release_by > ?", userID, time.Now()).Count(&count)
	return count > 0
}
