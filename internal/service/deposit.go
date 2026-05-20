package service

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/obeej/akin/internal/audit"
	"github.com/obeej/akin/internal/config"
	"github.com/obeej/akin/internal/models"
	"github.com/obeej/akin/internal/payments"
	"github.com/obeej/akin/internal/repository"
	"gorm.io/gorm"
)

var (
	ErrPaymentsNotConfigured = errors.New("payments_not_configured")
	ErrAmountTooSmall        = errors.New("amount_too_small")
	ErrInvalidFrequency      = errors.New("invalid_frequency")
	ErrDepositNotFound       = errors.New("deposit_not_found")
)

var validFrequencies = map[string]bool{"once": true, "weekly": true, "monthly": true}

type DepositService struct {
	repo     *repository.DepositRepo
	payments payments.DisbursementProvider
	cfg      *config.Config
	notify   *NotificationService
	db       *gorm.DB
}

func NewDepositService(repo *repository.DepositRepo, p payments.DisbursementProvider, cfg *config.Config, notify *NotificationService, db *gorm.DB) *DepositService {
	return &DepositService{repo: repo, payments: p, cfg: cfg, notify: notify, db: db}
}

type InitializeDepositInput struct {
	UserID     uuid.UUID
	UserEmail  string
	AmountKobo int64
	Frequency  string
}

type InitializeDepositResult struct {
	AuthorizationURL string
	Reference        string
}

func (s *DepositService) Initialize(ctx context.Context, input InitializeDepositInput) (*InitializeDepositResult, error) {
	if s.payments == nil {
		return nil, ErrPaymentsNotConfigured
	}
	if input.AmountKobo < 100 {
		return nil, ErrAmountTooSmall
	}
	if input.Frequency == "" {
		input.Frequency = "once"
	}
	if !validFrequencies[input.Frequency] {
		return nil, ErrInvalidFrequency
	}

	reference := "akin_" + uuid.NewString()
	deposit := &models.GiverDeposit{
		UserID:            input.UserID,
		AmountKobo:        input.AmountKobo,
		Currency:          "NGN",
		Frequency:         input.Frequency,
		Status:            "pending",
		PaystackReference: reference,
	}
	if err := s.repo.Create(deposit); err != nil {
		return nil, err
	}

	resp, err := s.payments.Initialize(ctx, payments.InitializeRequest{
		Email:       input.UserEmail,
		AmountKobo:  input.AmountKobo,
		Reference:   reference,
		CallbackURL: s.cfg.AppBaseURL + "/give/callback",
		Metadata:    map[string]string{"user_id": input.UserID.String(), "frequency": input.Frequency},
	})
	if err != nil {
		_ = s.repo.UpdateStatus(deposit.ID, "failed")
		audit.Record(s.db, input.UserID.String(), "deposit_initialize_failed", deposit.ID.String(), map[string]any{"err": err.Error()})
		return nil, err
	}

	_ = s.repo.UpdateAuthorizationURL(deposit.ID, resp.AuthorizationURL)
	audit.Record(s.db, input.UserID.String(), "deposit_initialized", deposit.ID.String(), map[string]any{
		"amountKobo": input.AmountKobo,
		"frequency":  input.Frequency,
	})

	return &InitializeDepositResult{AuthorizationURL: resp.AuthorizationURL, Reference: reference}, nil
}

// Poll fetches a deposit and optimistically verifies with Paystack if still pending.
func (s *DepositService) Poll(ctx context.Context, reference string, userID uuid.UUID) (*models.GiverDeposit, error) {
	deposit, err := s.repo.FindByReferenceAndUser(reference, userID)
	if err != nil {
		return nil, ErrDepositNotFound
	}
	if deposit.Status == "pending" && s.payments != nil {
		if v, err := s.payments.Verify(ctx, reference); err == nil && v.Status == "success" {
			_ = s.repo.Settle(deposit)
			deposit.Status = "succeeded"
		}
	}
	return deposit, nil
}

// Settle is called by the webhook handler — idempotent.
func (s *DepositService) Settle(reference string) error {
	deposit, err := s.repo.FindByReference(reference)
	if err != nil {
		return ErrDepositNotFound
	}
	if deposit.Status == "succeeded" {
		return nil // already settled — idempotent
	}
	if err := s.repo.Settle(deposit); err != nil {
		return err
	}
	audit.Record(s.db, "system", "deposit_settled", deposit.ID.String(), map[string]any{"amountKobo": deposit.AmountKobo})
	if s.notify != nil {
		_ = s.notify.Send(deposit.UserID, "deposit_settled",
			"Your gift joined the pool",
			"Thank you. Your gift has been received and added to this week's pool.",
		)
	}
	return nil
}
