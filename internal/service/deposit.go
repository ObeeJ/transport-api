package service

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/obeej/akin/internal/audit"
	"github.com/obeej/akin/internal/config"
	"github.com/obeej/akin/internal/models"
	"github.com/obeej/akin/internal/payments"
	"github.com/obeej/akin/internal/repository"
	"gorm.io/gorm"
)

var (
	ErrPaymentsNotConfigured    = errors.New("payments_not_configured")
	ErrAmountTooSmall           = errors.New("amount_too_small")
	ErrInvalidFrequency         = errors.New("invalid_frequency")
	ErrDepositNotFound          = errors.New("deposit_not_found")
	ErrActiveRecipientCannotGive = errors.New("active_recipient_cannot_give")
)

var validFrequencies = map[string]bool{"once": true, "weekly": true, "monthly": true}

type DepositService struct {
	repo          *repository.DepositRepo
	recipientRepo *repository.RecipientRepo
	payments      payments.DisbursementProvider
	cfg           *config.Config
	notify        *NotificationService
	db            *gorm.DB
}

func NewDepositService(repo *repository.DepositRepo, recipientRepo *repository.RecipientRepo, p payments.DisbursementProvider, cfg *config.Config, notify *NotificationService, db *gorm.DB) *DepositService {
	return &DepositService{repo: repo, recipientRepo: recipientRepo, payments: p, cfg: cfg, notify: notify, db: db}
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
	if active, err := s.recipientRepo.HasActiveRecipient(input.UserID); err != nil {
		return nil, err
	} else if active {
		return nil, ErrActiveRecipientCannotGive
	}
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

// Activity returns a weeks×7 matrix of donation intensity (0-4) for the user's
// last `weeks` weeks of successful deposits. Buckets are aligned to days,
// oldest week first, Sunday-first. Intensity is normalised against the busiest
// cell so the heatmap reads relatively even for low-activity users.
func (s *DepositService) Activity(ctx context.Context, userID uuid.UUID, weeks int) ([][]int, error) {
	if weeks <= 0 {
		weeks = 4
	}
	days := weeks * 7
	// Start at the Sunday `days-1` days before today so the top-left cell is
	// always the oldest Sunday in the window.
	now := time.Now().UTC()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	oldest := today.AddDate(0, 0, -(days - 1))
	// Roll back to the prior Sunday so columns line up consistently.
	oldest = oldest.AddDate(0, 0, -int(oldest.Weekday()))

	var rows []struct {
		Day time.Time
		Cnt int
	}
	if err := s.db.WithContext(ctx).
		Raw(`SELECT date_trunc('day', created_at) AS day, COUNT(*) AS cnt
		     FROM giver_deposits
		     WHERE user_id = ? AND status = 'succeeded' AND created_at >= ?
		     GROUP BY 1`, userID, oldest).
		Scan(&rows).Error; err != nil {
		return nil, err
	}

	matrix := make([][]int, weeks)
	for i := range matrix {
		matrix[i] = make([]int, 7)
	}
	counts := make([][]int, weeks)
	for i := range counts {
		counts[i] = make([]int, 7)
	}
	max := 0
	for _, r := range rows {
		d := time.Date(r.Day.Year(), r.Day.Month(), r.Day.Day(), 0, 0, 0, 0, time.UTC)
		offset := int(d.Sub(oldest).Hours() / 24)
		if offset < 0 || offset >= days {
			continue
		}
		w, dy := offset/7, offset%7
		counts[w][dy] = r.Cnt
		if r.Cnt > max {
			max = r.Cnt
		}
	}
	if max == 0 {
		return matrix, nil
	}
	for w := 0; w < weeks; w++ {
		for d := 0; d < 7; d++ {
			// Map counts to 0..4 intensity buckets relative to the busiest day.
			matrix[w][d] = (counts[w][d]*4 + max/2) / max
		}
	}
	return matrix, nil
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
