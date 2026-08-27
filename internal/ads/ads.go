// Package ads implements the self-serve advertiser system: ad CRUD, budget
// accounting, and impression recording. Serving decisions live in targeting.go.
//
// Money note: ad budgets are prepaid and denominated in kobo. Charging an
// impression is a monotonic increment of spent_kobo guarded by the budget
// ceiling, so an ad can never overspend even under concurrent serves.
package ads

import (
	"errors"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// CostPerImpressionKobo is the flat rate charged per served impression (₦1).
// Flat-rate rather than auction: with a single-campus advertiser pool an
// auction has no price discovery, and a predictable rate is easier to explain.
const CostPerImpressionKobo int64 = 100

var (
	ErrBudgetExhausted = errors.New("ads: budget exhausted")
	ErrNotOwner        = errors.New("ads: not the advertiser")
)

type Ad struct {
	ID           uuid.UUID      `gorm:"type:uuid;primaryKey" json:"id"`
	AdvertiserID uuid.UUID      `gorm:"type:uuid;not null" json:"advertiserId"`
	CreativeKey  string         `gorm:"not null" json:"creativeKey"`
	CTAURL       string         `gorm:"column:cta_url;not null" json:"ctaUrl"`
	BudgetKobo   int64          `gorm:"not null" json:"budgetKobo"`
	SpentKobo    int64          `gorm:"not null;default:0" json:"spentKobo"`
	Status       string         `gorm:"not null;default:pending" json:"status"` // pending | active | paused | exhausted | rejected
	Target       map[string]any `gorm:"serializer:json" json:"target,omitempty"`
	CreatedAt    time.Time      `json:"createdAt"`
}

func (Ad) TableName() string { return "ads" }

func (a *Ad) BeforeCreate(_ *gorm.DB) error {
	if a.ID == uuid.Nil {
		a.ID = uuid.New()
	}
	return nil
}

// RemainingKobo is what's left of the prepaid budget.
func (a *Ad) RemainingKobo() int64 { return a.BudgetKobo - a.SpentKobo }

type Impression struct {
	ID     uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	AdID   uuid.UUID `gorm:"type:uuid;not null" json:"adId"`
	UserID uuid.UUID `gorm:"type:uuid;not null" json:"-"`
	At     time.Time `json:"at"`
}

func (Impression) TableName() string { return "ad_impressions" }

func (i *Impression) BeforeCreate(_ *gorm.DB) error {
	if i.ID == uuid.Nil {
		i.ID = uuid.New()
	}
	return nil
}

// Create submits a new ad for review. Ads start 'pending' — an admin must
// approve before they can be served.
func Create(db *gorm.DB, advertiserID uuid.UUID, creativeKey, ctaURL string, budgetKobo int64, target map[string]any) (*Ad, error) {
	a := &Ad{
		AdvertiserID: advertiserID,
		CreativeKey:  creativeKey,
		CTAURL:       ctaURL,
		BudgetKobo:   budgetKobo,
		Status:       "pending",
		Target:       target,
	}
	return a, db.Create(a).Error
}

// ListMine returns every ad belonging to one advertiser, newest first.
func ListMine(db *gorm.DB, advertiserID uuid.UUID) ([]Ad, error) {
	var items []Ad
	return items, db.Where("advertiser_id = ?", advertiserID).
		Order("created_at DESC").Find(&items).Error
}

// Approve flips a pending ad to active (admin action). Passing approved=false
// rejects it instead.
func Approve(db *gorm.DB, adID uuid.UUID, approved bool) error {
	status := "rejected"
	if approved {
		status = "active"
	}
	return db.Model(&Ad{}).Where("id = ?", adID).Update("status", status).Error
}

// Pause lets an advertiser stop serving without losing remaining budget.
func Pause(db *gorm.DB, adID, advertiserID uuid.UUID) error {
	res := db.Model(&Ad{}).
		Where("id = ? AND advertiser_id = ?", adID, advertiserID).
		Update("status", "paused")
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotOwner
	}
	return nil
}

// RecordImpression writes the impression row and charges the ad's budget in one
// transaction. The UPDATE carries its own budget guard in the WHERE clause, so
// two concurrent serves can never push spent_kobo past budget_kobo — the loser
// affects zero rows and gets ErrBudgetExhausted rather than a torn read.
func RecordImpression(db *gorm.DB, adID, userID uuid.UUID) error {
	return db.Transaction(func(tx *gorm.DB) error {
		res := tx.Model(&Ad{}).
			Where("id = ? AND status = 'active' AND spent_kobo + ? <= budget_kobo", adID, CostPerImpressionKobo).
			UpdateColumn("spent_kobo", gorm.Expr("spent_kobo + ?", CostPerImpressionKobo))
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			// Either exhausted or no longer active. Mark exhausted so the
			// serving query stops considering it.
			tx.Model(&Ad{}).
				Where("id = ? AND status = 'active' AND spent_kobo >= budget_kobo", adID).
				Update("status", "exhausted")
			return ErrBudgetExhausted
		}
		return tx.Create(&Impression{AdID: adID, UserID: userID, At: time.Now()}).Error
	})
}

// Stats returns impression count and spend for one ad.
func Stats(db *gorm.DB, adID uuid.UUID) (impressions int64, spentKobo int64, err error) {
	if err = db.Model(&Impression{}).Where("ad_id = ?", adID).Count(&impressions).Error; err != nil {
		return 0, 0, err
	}
	var a Ad
	if err = db.Where("id = ?", adID).First(&a).Error; err != nil {
		return 0, 0, err
	}
	return impressions, a.SpentKobo, nil
}
