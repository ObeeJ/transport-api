// Package trust computes and caches user trust scores.
package trust

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Score struct {
	UserID       uuid.UUID      `gorm:"type:uuid;primaryKey"`
	Score        int            `gorm:"not null;default:50"`
	Tier         string         `gorm:"not null;default:new"`
	Components   map[string]any `gorm:"serializer:json"`
	RecomputedAt time.Time
}

func (Score) TableName() string { return "trust_scores" }

// Get returns the trust score for a user, creating a default if absent.
func Get(db *gorm.DB, userID uuid.UUID) (*Score, error) {
	s := &Score{UserID: userID, Score: 50, Tier: "new", RecomputedAt: time.Now()}
	err := db.Clauses(clause.OnConflict{DoNothing: true}).Create(s).Error
	if err != nil {
		return nil, err
	}
	if err := db.Where("user_id = ?", userID).First(s).Error; err != nil {
		return nil, err
	}
	return s, nil
}

// Recompute recalculates a user's trust score from their activity.
func Recompute(db *gorm.DB, userID uuid.UUID) error {
	var tripCount, ratingCount int64
	var avgRating float64
	db.Raw("SELECT COUNT(*) FROM trips WHERE driver_id = ? AND status = 'completed'", userID).Scan(&tripCount)
	db.Raw("SELECT COUNT(*), COALESCE(AVG(score),0) FROM trip_ratings WHERE subject_id = ?", userID).Row().Scan(&ratingCount, &avgRating)

	score := 50
	score += int(min(tripCount, 20)) * 2 // up to +40 for trips
	if ratingCount > 0 {
		score += int((avgRating - 3) * 5) // ±10 for rating vs 3.0 baseline
	}
	if score > 100 {
		score = 100
	}
	if score < 0 {
		score = 0
	}

	tier := tierFor(score)
	return db.Table("trust_scores").Where("user_id = ?", userID).
		Assign(map[string]any{
			"score":         score,
			"tier":          tier,
			"recomputed_at": time.Now(),
		}).FirstOrCreate(&Score{UserID: userID}).Error
}

func tierFor(score int) string {
	switch {
	case score >= 80:
		return "trusted"
	case score >= 60:
		return "established"
	case score >= 40:
		return "growing"
	default:
		return "new"
	}
}

func min(a, b int64) int64 {
	if a < b {
		return a
	}
	return b
}
