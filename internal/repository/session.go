package repository

import (
	"github.com/google/uuid"
	"github.com/obeej/akin/internal/models"
	"gorm.io/gorm"
)

type SessionRepo struct{ db *gorm.DB }

func NewSessionRepo(db *gorm.DB) *SessionRepo { return &SessionRepo{db} }

func (r *SessionRepo) Create(s *models.Session) error {
	return r.db.Create(s).Error
}

func (r *SessionRepo) FindByTokenHash(hash string) (*models.Session, error) {
	var s models.Session
	return &s, r.db.Where("token_hash = ?", hash).First(&s).Error
}

func (r *SessionRepo) DeleteByTokenHash(hash string) error {
	return r.db.Where("token_hash = ?", hash).Delete(&models.Session{}).Error
}

func (r *SessionRepo) TouchLastSeen(id uuid.UUID) error {
	return r.db.Model(&models.Session{}).Where("id = ?", id).
		UpdateColumn("last_seen_at", gorm.Expr("NOW()")).Error
}

func (r *SessionRepo) DeleteAllForUser(userID uuid.UUID) error {
	return r.db.Where("user_id = ?", userID).Delete(&models.Session{}).Error
}
