package repository

import (
	"time"

	"github.com/google/uuid"
	"github.com/obeej/akin/internal/models"
	"gorm.io/gorm"
)

type StrikeRepo struct {
	db *gorm.DB
}

func NewStrikeRepo(db *gorm.DB) *StrikeRepo {
	return &StrikeRepo{db: db}
}

func (r *StrikeRepo) Create(s *models.Strike) error {
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	return r.db.Create(s).Error
}

// ActiveCount returns the number of un-cleared strikes for a user created at or
// after `since` — the value the suspension threshold is compared against.
func (r *StrikeRepo) ActiveCount(userID uuid.UUID, since time.Time) (int64, error) {
	var n int64
	err := r.db.Model(&models.Strike{}).
		Where("user_id = ?", userID).
		Where("cleared_at IS NULL").
		Where("created_at >= ?", since).
		Count(&n).Error
	return n, err
}

// ListByUser returns a user's strikes, newest first.
func (r *StrikeRepo) ListByUser(userID uuid.UUID) ([]models.Strike, error) {
	var out []models.Strike
	err := r.db.Where("user_id = ?", userID).Order("created_at DESC").Find(&out).Error
	return out, err
}

// ListActive returns all un-cleared strikes created at or after `since`, newest
// first — the steward review queue.
func (r *StrikeRepo) ListActive(since time.Time) ([]models.Strike, error) {
	var out []models.Strike
	err := r.db.
		Where("cleared_at IS NULL").
		Where("created_at >= ?", since).
		Order("created_at DESC").Find(&out).Error
	return out, err
}

// Clear marks a strike resolved. Idempotent — clearing an already-cleared
// strike leaves the original timestamp untouched.
func (r *StrikeRepo) Clear(id, clearedBy uuid.UUID, reason string) error {
	now := time.Now()
	return r.db.Model(&models.Strike{}).
		Where("id = ? AND cleared_at IS NULL", id).
		Updates(map[string]any{
			"cleared_at":     now,
			"cleared_by":     clearedBy,
			"cleared_reason": reason,
		}).Error
}
