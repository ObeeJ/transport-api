package repository

import (
	"time"

	"github.com/google/uuid"
	"github.com/obeej/akin/internal/models"
	"gorm.io/gorm"
)

type PayoutRepo struct{ db *gorm.DB }

func NewPayoutRepo(db *gorm.DB) *PayoutRepo { return &PayoutRepo{db} }

func (r *PayoutRepo) Create(p *models.Payout) error {
	return r.db.Create(p).Error
}

func (r *PayoutRepo) FindByID(id uuid.UUID) (*models.Payout, error) {
	var p models.Payout
	return &p, r.db.First(&p, "id = ?", id).Error
}

func (r *PayoutRepo) FindByReference(ref string) (*models.Payout, error) {
	var p models.Payout
	return &p, r.db.Where("reference = ?", ref).First(&p).Error
}

func (r *PayoutRepo) Update(id uuid.UUID, updates map[string]any) error {
	return r.db.Model(&models.Payout{}).Where("id = ?", id).Updates(updates).Error
}

func (r *PayoutRepo) List(limit int) ([]models.Payout, error) {
	var items []models.Payout
	return items, r.db.Order("created_at desc").Limit(limit).Find(&items).Error
}

func (r *PayoutRepo) ListCursor(cursor time.Time, limit int) ([]models.Payout, error) {
	var items []models.Payout
	q := r.db.Order("created_at desc").Limit(limit)
	if !cursor.IsZero() {
		q = q.Where("created_at < ?", cursor)
	}
	return items, q.Find(&items).Error
}

// SummarySince returns total disbursed kobo and unique recipient count in a window.
func (r *PayoutRepo) SummarySince(from, to time.Time) (int64, int64, error) {
	var result struct {
		Total int64
		Count int64
	}
	err := r.db.Model(&models.Payout{}).
		Where("status = ? AND settled_at >= ? AND settled_at < ?", "succeeded", from, to).
		Select("COALESCE(SUM(amount_kobo),0) as total, COUNT(DISTINCT recipient_id) as count").
		Scan(&result).Error
	return result.Total, result.Count, err
}
