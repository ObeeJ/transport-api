package repository

import (
	"github.com/google/uuid"
	"github.com/obeej/akin/internal/models"
	"gorm.io/gorm"
)

type RecipientRepo struct{ db *gorm.DB }

func NewRecipientRepo(db *gorm.DB) *RecipientRepo { return &RecipientRepo{db} }

func (r *RecipientRepo) Create(rec *models.Recipient) error {
	return r.db.Create(rec).Error
}

func (r *RecipientRepo) FindByUserID(userID uuid.UUID) (*models.Recipient, error) {
	var rec models.Recipient
	return &rec, r.db.Where("user_id = ?", userID).First(&rec).Error
}

func (r *RecipientRepo) FindByID(id uuid.UUID) (*models.Recipient, error) {
	var rec models.Recipient
	return &rec, r.db.First(&rec, "id = ?", id).Error
}

func (r *RecipientRepo) FindByPseudonymousID(pseudo string) (*models.Recipient, error) {
	var rec models.Recipient
	return &rec, r.db.Where("pseudonymous_id = ?", pseudo).First(&rec).Error
}

func (r *RecipientRepo) ListPending() ([]models.Recipient, error) {
	var items []models.Recipient
	return items, r.db.Where("status = ?", "pending").Order("created_at asc").Find(&items).Error
}

func (r *RecipientRepo) HasActiveRecipient(userID uuid.UUID) (bool, error) {
	var count int64
	err := r.db.Model(&models.Recipient{}).Where("user_id = ? AND status = ?", userID, "approved").Count(&count).Error
	return count > 0, err
}

func (r *RecipientRepo) ListApproved() ([]models.Recipient, error) {
	var items []models.Recipient
	return items, r.db.Where("status = ?", "approved").Order("decided_at desc").Find(&items).Error
}

func (r *RecipientRepo) UpdateStatus(id uuid.UUID, updates map[string]any) error {
	return r.db.Model(&models.Recipient{}).Where("id = ?", id).Updates(updates).Error
}

// Bank account

func (r *RecipientRepo) FindBank(recipientID uuid.UUID) (*models.RecipientBankAccount, error) {
	var b models.RecipientBankAccount
	return &b, r.db.Where("recipient_id = ?", recipientID).First(&b).Error
}

func (r *RecipientRepo) UpsertBank(b *models.RecipientBankAccount) error {
	var existing models.RecipientBankAccount
	if err := r.db.Where("recipient_id = ?", b.RecipientID).First(&existing).Error; err == nil {
		b.ID = existing.ID
		b.CreatedAt = existing.CreatedAt
		return r.db.Save(b).Error
	}
	return r.db.Create(b).Error
}
