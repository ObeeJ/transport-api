package service

import (
	"github.com/google/uuid"
	"github.com/obeej/akin/internal/models"
	"github.com/obeej/akin/internal/repository"
)

// Notifier is the interface future SMS/email/push adapters will implement.
// The default implementation writes to the notifications table (in_app).
type Notifier interface {
	Send(userID uuid.UUID, event, title, body string) error
}

type NotificationService struct {
	repo *repository.NotificationRepo
}

func NewNotificationService(repo *repository.NotificationRepo) *NotificationService {
	return &NotificationService{repo: repo}
}

// Send writes an in_app notification. Errors are non-fatal — notification
// failures must never block the business operation that triggered them.
func (s *NotificationService) Send(userID uuid.UUID, event, title, body string) error {
	return s.repo.Create(&models.Notification{
		UserID:  userID,
		Channel: "in_app",
		Event:   event,
		Title:   title,
		Body:    body,
	})
}

func (s *NotificationService) List(userID uuid.UUID) ([]models.Notification, error) {
	return s.repo.ListForUser(userID, 50)
}

func (s *NotificationService) MarkRead(id, userID uuid.UUID) error {
	return s.repo.MarkRead(id, userID)
}

func (s *NotificationService) MarkAllRead(userID uuid.UUID) error {
	return s.repo.MarkAllRead(userID)
}

func (s *NotificationService) UnreadCount(userID uuid.UUID) (int64, error) {
	return s.repo.UnreadCount(userID)
}
