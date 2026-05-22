package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/obeej/akin/internal/audit"
	"github.com/obeej/akin/internal/email"
	"github.com/obeej/akin/internal/repository"
	"gorm.io/gorm"
)

var (
	ErrInvalidVerifyToken = errors.New("invalid_verify_token")
	ErrAlreadyVerified    = errors.New("already_verified")
)

type EmailVerifyService struct {
	users      *repository.UserRepo
	notify     *NotificationService
	mailer     *email.Sender
	apiBaseURL string
	db         *gorm.DB
}

func NewEmailVerifyService(
	users *repository.UserRepo,
	notify *NotificationService,
	mailer *email.Sender,
	apiBaseURL string,
	db *gorm.DB,
) *EmailVerifyService {
	return &EmailVerifyService{
		users:      users,
		notify:     notify,
		mailer:     mailer,
		apiBaseURL: apiBaseURL,
		db:         db,
	}
}

// IssueToken generates a token, stores it, and sends a real email.
// Falls back to in-app notification if Resend is not configured (local dev).
func (s *EmailVerifyService) IssueToken(ctx context.Context, userID uuid.UUID) (string, error) {
	user, err := s.users.FindByID(userID)
	if err != nil {
		return "", ErrNotFound
	}
	if user.IsEmailVerified() {
		return "", ErrAlreadyVerified
	}

	token, err := generateVerifyToken()
	if err != nil {
		return "", err
	}

	if err := s.users.SetVerifyToken(userID, token); err != nil {
		return "", err
	}

	if s.mailer != nil && s.mailer.Configured() {
		// Real email with a click-to-verify link.
		if err := s.mailer.SendVerification(ctx, user.Email, token, s.apiBaseURL); err != nil {
			return "", err
		}
	} else {
		// Dev fallback: log to server only. Never expose the token in the UI.
		slog.Warn("email not configured — verification token logged to server only",
			"user", user.Email,
			"token", token,
		)
	}

	audit.Record(s.db, userID.String(), "email_verify_issued", userID.String(), nil)
	return token, nil
}

func (s *EmailVerifyService) EmailConfigured() bool {
	return s.mailer != nil && s.mailer.Configured()
}

// FindUserByToken looks up a user by their pending verify token.
// Used by the link-click confirm flow where we don't have a session.
func (s *EmailVerifyService) FindUserByToken(token string) (uuid.UUID, error) {
	user, err := s.users.FindByVerifyToken(token)
	if err != nil {
		return uuid.Nil, ErrInvalidVerifyToken
	}
	return user.ID, nil
}

// Confirm checks the token and marks the email as verified.
func (s *EmailVerifyService) Confirm(userID uuid.UUID, token string) error {
	user, err := s.users.FindByID(userID)
	if err != nil {
		return ErrNotFound
	}
	if user.IsEmailVerified() {
		return ErrAlreadyVerified
	}
	if user.EmailVerifyToken != token || token == "" {
		return ErrInvalidVerifyToken
	}

	now := time.Now()
	if err := s.users.MarkEmailVerified(userID, now); err != nil {
		return err
	}

	audit.Record(s.db, userID.String(), "email_verified", userID.String(), nil)
	return nil
}

func generateVerifyToken() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
