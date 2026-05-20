package repository

import (
	"github.com/google/uuid"
	"github.com/obeej/akin/internal/models"
	"gorm.io/gorm"
)

type NotificationRepo struct{ db *gorm.DB }

func NewNotificationRepo(db *gorm.DB) *NotificationRepo { return &NotificationRepo{db} }

func (r *NotificationRepo) Create(n *models.Notification) error {
	return r.db.Create(n).Error
}

func (r *NotificationRepo) ListForUser(userID uuid.UUID, limit int) ([]models.Notification, error) {
	var items []models.Notification
	return items, r.db.Where("user_id = ?", userID).
		Order("created_at desc").Limit(limit).Find(&items).Error
}

func (r *NotificationRepo) MarkRead(id, userID uuid.UUID) error {
	return r.db.Model(&models.Notification{}).
		Where("id = ? AND user_id = ?", id, userID).
		UpdateColumn("read_at", gorm.Expr("NOW()")).Error
}

func (r *NotificationRepo) MarkAllRead(userID uuid.UUID) error {
	return r.db.Model(&models.Notification{}).
		Where("user_id = ? AND read_at IS NULL", userID).
		UpdateColumn("read_at", gorm.Expr("NOW()")).Error
}

func (r *NotificationRepo) UnreadCount(userID uuid.UUID) (int64, error) {
	var count int64
	return count, r.db.Model(&models.Notification{}).
		Where("user_id = ? AND read_at IS NULL", userID).
		Count(&count).Error
}
