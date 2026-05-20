package repository

import (
	"time"

	"github.com/google/uuid"
	"github.com/obeej/akin/internal/models"
	"gorm.io/gorm"
)

type UserRepo struct{ db *gorm.DB }

func NewUserRepo(db *gorm.DB) *UserRepo { return &UserRepo{db} }

func (r *UserRepo) Create(u *models.User) error {
	return r.db.Create(u).Error
}

func (r *UserRepo) FindByEmail(email string) (*models.User, error) {
	var u models.User
	return &u, r.db.Where("email = ?", email).First(&u).Error
}

func (r *UserRepo) FindByID(id uuid.UUID) (*models.User, error) {
	var u models.User
	return &u, r.db.First(&u, "id = ?", id).Error
}

func (r *UserRepo) FindByIDs(ids []uuid.UUID) ([]models.User, error) {
	var users []models.User
	if len(ids) == 0 {
		return users, nil
	}
	return users, r.db.Where("id IN ?", ids).Find(&users).Error
}

func (r *UserRepo) SetVerifyToken(id uuid.UUID, token string) error {
	return r.db.Model(&models.User{}).Where("id = ?", id).
		UpdateColumn("email_verify_token", token).Error
}

func (r *UserRepo) MarkEmailVerified(id uuid.UUID, at time.Time) error {
	return r.db.Model(&models.User{}).Where("id = ?", id).Updates(map[string]any{
		"email_verified_at":  at,
		"email_verify_token": "",
	}).Error
}

func (r *UserRepo) FindByVerifyToken(token string) (*models.User, error) {
	var u models.User
	return &u, r.db.Where("email_verify_token = ?", token).First(&u).Error
}

func (r *UserRepo) SetPasswordResetToken(id uuid.UUID, token string, expiresAt time.Time) error {
	return r.db.Model(&models.User{}).Where("id = ?", id).Updates(map[string]any{
		"password_reset_token":      token,
		"password_reset_expires_at": expiresAt,
	}).Error
}

func (r *UserRepo) FindByPasswordResetToken(token string) (*models.User, error) {
	var u models.User
	return &u, r.db.Where("password_reset_token = ? AND password_reset_expires_at > ?", token, time.Now()).First(&u).Error
}

func (r *UserRepo) UpdatePassword(id uuid.UUID, hash string) error {
	return r.db.Model(&models.User{}).Where("id = ?", id).Updates(map[string]any{
		"password_hash":             hash,
		"password_reset_token":      "",
		"password_reset_expires_at": nil,
	}).Error
}
