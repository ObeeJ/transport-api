package repository

import (
	"github.com/google/uuid"
	"github.com/obeej/akin/internal/models"
	"gorm.io/gorm"
)

type RosterRepo struct{ db *gorm.DB }

func NewRosterRepo(db *gorm.DB) *RosterRepo { return &RosterRepo{db} }

func (r *RosterRepo) Create(entry *models.RosterEntry) error {
	return r.db.Create(entry).Error
}

func (r *RosterRepo) FindByHash(hash string) (*models.RosterEntry, error) {
	var e models.RosterEntry
	return &e, r.db.Where("id_hash = ?", hash).First(&e).Error
}

func (r *RosterRepo) FindByUserID(userID uuid.UUID) (*models.RosterEntry, error) {
	var e models.RosterEntry
	return &e, r.db.Where("user_id = ?", userID).First(&e).Error
}

func (r *RosterRepo) Count() (int64, error) {
	var n int64
	return n, r.db.Model(&models.RosterEntry{}).Count(&n).Error
}
