package repository

import (
	"time"

	"github.com/google/uuid"
	"github.com/obeej/akin/internal/models"
	"gorm.io/gorm"
)

type DepositRepo struct{ db *gorm.DB }

func NewDepositRepo(db *gorm.DB) *DepositRepo { return &DepositRepo{db} }

func (r *DepositRepo) Create(d *models.GiverDeposit) error {
	return r.db.Create(d).Error
}

func (r *DepositRepo) FindByReference(ref string) (*models.GiverDeposit, error) {
	var d models.GiverDeposit
	return &d, r.db.Where("paystack_reference = ?", ref).First(&d).Error
}

func (r *DepositRepo) FindByReferenceAndUser(ref string, userID uuid.UUID) (*models.GiverDeposit, error) {
	var d models.GiverDeposit
	return &d, r.db.Where("paystack_reference = ? AND user_id = ?", ref, userID).First(&d).Error
}

func (r *DepositRepo) UpdateAuthorizationURL(id uuid.UUID, url string) error {
	return r.db.Model(&models.GiverDeposit{}).Where("id = ?", id).
		UpdateColumn("authorization_url", url).Error
}

func (r *DepositRepo) UpdateStatus(id uuid.UUID, status string) error {
	return r.db.Model(&models.GiverDeposit{}).Where("id = ?", id).
		UpdateColumn("status", status).Error
}

func (r *DepositRepo) Settle(d *models.GiverDeposit) error {
	now := time.Now()
	return r.db.Model(d).Updates(map[string]any{
		"status":     "succeeded",
		"settled_at": &now,
	}).Error
}

// PoolSummary returns aggregate stats for deposits settled within the given window.
type PoolSummary struct {
	TotalKobo    int64
	DepositCount int64
	UniqueGivers int64
}

func (r *DepositRepo) SummarySince(since time.Time) (PoolSummary, error) {
	var s PoolSummary
	base := r.db.Model(&models.GiverDeposit{}).
		Where("status = ? AND settled_at >= ?", "succeeded", since)

	if err := base.Select("COALESCE(SUM(amount_kobo), 0)").Scan(&s.TotalKobo).Error; err != nil {
		return s, err
	}
	if err := base.Count(&s.DepositCount).Error; err != nil {
		return s, err
	}
	if err := base.Distinct("user_id").Count(&s.UniqueGivers).Error; err != nil {
		return s, err
	}
	return s, nil
}
