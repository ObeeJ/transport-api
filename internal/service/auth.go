package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/obeej/akin/internal/audit"
	"github.com/obeej/akin/internal/config"
	"github.com/obeej/akin/internal/email"
	"github.com/obeej/akin/internal/models"
	"github.com/obeej/akin/internal/repository"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

var (
	ErrEmailTaken        = errors.New("email_taken")
	ErrInvalidCreds      = errors.New("invalid_credentials")
	ErrPhoneInvalid      = errors.New("phone_invalid")
	ErrPasswordTooShort  = errors.New("password_too_short")
	ErrEmailInvalid      = errors.New("email_invalid")
	ErrResetTokenInvalid = errors.New("reset_token_invalid")
	ErrOTPInvalid        = errors.New("otp_invalid")
	ErrNotSteward        = errors.New("not_steward")
	ErrPrivacyRequired   = errors.New("privacy_required")
	ErrOrgNotFound       = errors.New("org_not_found")
)

// PrivacyVersion is the current Privacy Promise version. Bump this string
// when the policy text changes materially — older accounts will still show
// a stale version in their record, which lets us prompt re-acceptance.
const PrivacyVersion = "2026-05-22"

type AuthService struct {
	users        *repository.UserRepo
	sessions     *repository.SessionRepo
	institutions *repository.InstitutionRepo
	cfg          *config.Config
	mailer       *email.Sender
	db           *gorm.DB
}

func NewAuthService(users *repository.UserRepo, sessions *repository.SessionRepo, institutions *repository.InstitutionRepo, cfg *config.Config, mailer *email.Sender, db *gorm.DB) *AuthService {
	return &AuthService{users: users, sessions: sessions, institutions: institutions, cfg: cfg, mailer: mailer, db: db}
}

type SignupInput struct {
	Email            string
	FirstName        string
	LastName         string
	Phone            string
	Password         string
	AcceptedPrivacy  bool
	// OrgSlug pins the new account to an institution (church/school/workplace).
	// Resolved from the signup URL (subdomain or ?org=slug). Empty → the default
	// institution, preserving single-tenant behaviour.
	OrgSlug          string
}

type SessionToken struct {
	Token   string
	Session *models.Session
	User    *models.User
}

func (s *AuthService) Signup(input SignupInput) (*SessionToken, error) {
	input.Email = strings.ToLower(strings.TrimSpace(input.Email))
	input.FirstName = strings.TrimSpace(input.FirstName)
	input.LastName = strings.TrimSpace(input.LastName)
	if input.Email == "" || !strings.Contains(input.Email, "@") {
		return nil, ErrEmailInvalid
	}
	if len(input.Password) < 8 {
		return nil, ErrPasswordTooShort
	}
	if !input.AcceptedPrivacy {
		return nil, ErrPrivacyRequired
	}
	phone, err := normalizePhone(input.Phone)
	if err != nil {
		return nil, ErrPhoneInvalid
	}

	if _, err := s.users.FindByEmail(input.Email); err == nil {
		return nil, ErrEmailTaken
	}

	// Resolve which institution this account belongs to. Unknown/empty slug
	// falls back to the default institution so single-tenant signup is unchanged.
	institutionID := models.DefaultInstitutionID
	if input.OrgSlug != "" && s.institutions != nil {
		if inst, err := s.institutions.FindBySlug(input.OrgSlug); err == nil {
			institutionID = inst.ID
		} else {
			return nil, ErrOrgNotFound
		}
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	user := &models.User{
		InstitutionID:     institutionID,
		Email:             input.Email,
		FirstName:         input.FirstName,
		LastName:          input.LastName,
		PhoneE164:         phone,
		PasswordHash:      string(hash),
		PrivacyAcceptedAt: &now,
		PrivacyVersion:    PrivacyVersion,
	}
	if err := s.users.Create(user); err != nil {
		return nil, err
	}

	st, err := s.issueSession(user)
	if err != nil {
		return nil, err
	}

	audit.Record(s.db, user.ID.String(), "signup", user.ID.String(), nil)
	return st, nil
}

type LoginInput struct {
	Email    string
	Password string
}

func (s *AuthService) Login(input LoginInput) (*SessionToken, error) {
	input.Email = strings.ToLower(strings.TrimSpace(input.Email))
	user, err := s.users.FindByEmail(input.Email)
	if err != nil {
		return nil, ErrInvalidCreds
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(input.Password)); err != nil {
		return nil, ErrInvalidCreds
	}

	st, err := s.issueSession(user)
	if err != nil {
		return nil, err
	}

	audit.Record(s.db, user.ID.String(), "login", user.ID.String(), nil)
	return st, nil
}

func (s *AuthService) Logout(tokenHash string, userID uuid.UUID) error {
	_ = s.sessions.DeleteByTokenHash(tokenHash)
	audit.Record(s.db, userID.String(), "logout", userID.String(), nil)
	return nil
}

// RequestPasswordReset generates a token and emails it. Silent on unknown email.
func (s *AuthService) RequestPasswordReset(ctx context.Context, emailAddr string) error {
	emailAddr = strings.ToLower(strings.TrimSpace(emailAddr))
	user, err := s.users.FindByEmail(emailAddr)
	if err != nil {
		return nil // silent — don't reveal whether email exists
	}

	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return err
	}
	token := hex.EncodeToString(b)
	expiresAt := time.Now().Add(1 * time.Hour)

	if err := s.users.SetPasswordResetToken(user.ID, token, expiresAt); err != nil {
		return err
	}

	if s.mailer != nil && s.mailer.Configured() {
		_ = s.mailer.SendPasswordReset(ctx, user.Email, token, s.cfg.AppBaseURL)
	}

	audit.Record(s.db, user.ID.String(), "password_reset_requested", user.ID.String(), nil)
	return nil
}

// ConfirmPasswordReset validates the token, sets the new password, and invalidates all sessions.
func (s *AuthService) ConfirmPasswordReset(token, newPassword string) error {
	if len(newPassword) < 8 {
		return ErrPasswordTooShort
	}
	user, err := s.users.FindByPasswordResetToken(token)
	if err != nil {
		return ErrResetTokenInvalid
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	if err := s.users.UpdatePassword(user.ID, string(hash)); err != nil {
		return err
	}
	// Invalidate all sessions.
	_ = s.sessions.DeleteAllForUser(user.ID)

	audit.Record(s.db, user.ID.String(), "password_reset_confirmed", user.ID.String(), nil)
	return nil
}

// RequestStewardOTP generates a 6-digit code, stores its hash, and emails the
// plain code. Silent on unknown email or non-steward user to avoid leaking
// who is/isn't elevated. Codes expire in 10 minutes.
func (s *AuthService) RequestStewardOTP(ctx context.Context, emailAddr string) error {
	emailAddr = strings.ToLower(strings.TrimSpace(emailAddr))
	user, err := s.users.FindByEmail(emailAddr)
	if err != nil {
		return nil // silent
	}
	if !user.IsSteward() {
		return nil // silent — don't reveal role
	}

	code, err := newOTPCode()
	if err != nil {
		return err
	}
	hash := hashOTP(code)
	expiresAt := time.Now().Add(10 * time.Minute)

	if err := s.users.SetOTP(user.ID, hash, expiresAt); err != nil {
		return err
	}

	if s.mailer != nil && s.mailer.Configured() {
		_ = s.mailer.SendStewardOTP(ctx, user.Email, code)
	}

	audit.Record(s.db, user.ID.String(), "steward_otp_requested", user.ID.String(), nil)
	return nil
}

// VerifyStewardOTP checks the code in constant time, issues a session if it
// matches and is unexpired, and clears the code so it can't be replayed.
func (s *AuthService) VerifyStewardOTP(ctx context.Context, emailAddr, code string) (*SessionToken, error) {
	emailAddr = strings.ToLower(strings.TrimSpace(emailAddr))
	code = strings.TrimSpace(code)
	user, err := s.users.FindByEmail(emailAddr)
	if err != nil {
		return nil, ErrOTPInvalid
	}
	if !user.IsSteward() {
		return nil, ErrNotSteward
	}
	if user.OTPCodeHash == "" || user.OTPExpiresAt == nil || time.Now().After(*user.OTPExpiresAt) {
		return nil, ErrOTPInvalid
	}
	expected, got := []byte(user.OTPCodeHash), []byte(hashOTP(code))
	if subtle.ConstantTimeCompare(expected, got) != 1 {
		return nil, ErrOTPInvalid
	}
	_ = s.users.ClearOTP(user.ID)

	st, err := s.issueSession(user)
	if err != nil {
		return nil, err
	}
	audit.Record(s.db, user.ID.String(), "steward_otp_verified", user.ID.String(), nil)
	return st, nil
}

// newOTPCode returns a 6-digit numeric code (zero-padded). Uses crypto/rand
// so each code is unpredictable.
func newOTPCode() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

func hashOTP(code string) string {
	sum := sha256.Sum256([]byte(code))
	return hex.EncodeToString(sum[:])
}

func (s *AuthService) issueSession(user *models.User) (*SessionToken, error) {
	raw, err := newToken()
	if err != nil {
		return nil, err
	}
	session := &models.Session{
		UserID:     user.ID,
		TokenHash:  hashToken(raw),
		ExpiresAt:  time.Now().Add(s.cfg.SessionTTL),
		LastSeenAt: time.Now(),
	}
	if err := s.sessions.Create(session); err != nil {
		return nil, err
	}
	return &SessionToken{Token: raw, Session: session, User: user}, nil
}

func newToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}
