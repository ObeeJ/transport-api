// Package ambassador manages the ambassador program.
package ambassador

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var ErrAlreadyActivated = errors.New("ambassador: already activated")

type Ambassador struct {
	UserID       uuid.UUID `gorm:"type:uuid;primaryKey" json:"userId"`
	ActivatedAt  time.Time `json:"activatedAt"`
	Tier         string    `gorm:"not null;default:bronze" json:"tier"`
	ReferralCode string    `gorm:"uniqueIndex;not null" json:"referralCode"`
	EarnedWings  int64     `gorm:"not null;default:0" json:"earnedWings"`
	EarnedNaira  int64     `gorm:"not null;default:0" json:"earnedNaira"`
	VanityURL    *string   `gorm:"uniqueIndex" json:"vanityUrl,omitempty"`
}

func (Ambassador) TableName() string { return "ambassadors" }

type Referral struct {
	ID           uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	AmbassadorID uuid.UUID  `gorm:"type:uuid;not null" json:"ambassadorId"`
	ReferredID   uuid.UUID  `gorm:"type:uuid;not null;uniqueIndex" json:"referredId"`
	RewardStatus string     `gorm:"not null;default:pending" json:"rewardStatus"`
	PaidTxnID    *uuid.UUID `gorm:"type:uuid" json:"paidTxnId,omitempty"`
	CreatedAt    time.Time  `json:"createdAt"`
	ResolvedAt   *time.Time `json:"resolvedAt,omitempty"`
}

func (Referral) TableName() string { return "ambassador_referrals" }

func (r *Referral) BeforeCreate(_ *gorm.DB) error {
	if r.ID == uuid.Nil {
		r.ID = uuid.New()
	}
	return nil
}

// Activate creates an ambassador record for a user.
func Activate(db *gorm.DB, userID uuid.UUID) (*Ambassador, error) {
	code, err := generateCode()
	if err != nil {
		return nil, err
	}
	a := &Ambassador{
		UserID:       userID,
		ActivatedAt:  time.Now(),
		Tier:         "bronze",
		ReferralCode: code,
	}
	if err := db.Clauses(clause.OnConflict{DoNothing: true}).Create(a).Error; err != nil {
		return nil, err
	}
	return a, db.Where("user_id = ?", userID).First(a).Error
}

// Get returns the ambassador record for a user.
func Get(db *gorm.DB, userID uuid.UUID) (*Ambassador, error) {
	var a Ambassador
	return &a, db.Where("user_id = ?", userID).First(&a).Error
}

func generateCode() (string, error) {
	b := make([]byte, 4)
	_, err := rand.Read(b)
	return "AKN" + hex.EncodeToString(b), err
}
