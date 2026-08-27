// Package circle manages Akin Circle memberships and badge resolution.
package circle

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Membership struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	UserID         uuid.UUID `gorm:"type:uuid;not null;uniqueIndex" json:"userId"`
	PurchasedAt    time.Time `gorm:"not null" json:"purchasedAt"`
	PriceKobo      int64     `gorm:"not null" json:"priceKobo"`
	Status         string    `gorm:"not null;default:active" json:"status"`
	FoundingMember bool      `json:"foundingMember"`
}

func (Membership) TableName() string { return "circle_memberships" }

func (m *Membership) BeforeCreate(_ *gorm.DB) error {
	if m.ID == uuid.Nil {
		m.ID = uuid.New()
	}
	return nil
}

// BadgeLevel returns the badge tier for a user.
// grey=verified, blue=circle, gold=founding, diamond=top-contributor
func BadgeLevel(db *gorm.DB, userID uuid.UUID) string {
	var m Membership
	if err := db.Where("user_id = ? AND status = 'active'", userID).First(&m).Error; err != nil {
		// Check KYC tier for grey badge.
		var tier int
		db.Raw("SELECT COALESCE(tier,0) FROM kyc_records WHERE user_id = ?", userID).Scan(&tier)
		if tier >= 1 {
			return "grey"
		}
		return ""
	}
	if m.FoundingMember {
		return "gold"
	}
	return "blue"
}

// IsMember returns true if the user has an active Circle membership.
func IsMember(db *gorm.DB, userID uuid.UUID) bool {
	var count int64
	db.Model(&Membership{}).Where("user_id = ? AND status = 'active'", userID).Count(&count)
	return count > 0
}

// Purchase creates a membership record (payment handled by Paystack webhook).
func Purchase(db *gorm.DB, userID uuid.UUID, priceKobo int64, founding bool) (*Membership, error) {
	m := &Membership{
		UserID:         userID,
		PurchasedAt:    time.Now(),
		PriceKobo:      priceKobo,
		Status:         "active",
		FoundingMember: founding,
	}
	err := db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "user_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"status", "purchased_at", "founding_member"}),
	}).Create(m).Error
	return m, err
}

// Status returns the membership for a user.
func Status(db *gorm.DB, userID uuid.UUID) (*Membership, string) {
	var m Membership
	if err := db.Where("user_id = ? AND status = 'active'", userID).First(&m).Error; err != nil {
		return nil, BadgeLevel(db, userID)
	}
	return &m, BadgeLevel(db, userID)
}
