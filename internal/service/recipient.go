package service

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/obeej/akin/internal/audit"
	"github.com/obeej/akin/internal/identity"
	"github.com/obeej/akin/internal/models"
	"github.com/obeej/akin/internal/payments"
	"github.com/obeej/akin/internal/repository"
	"gorm.io/gorm"
)

var (
	ErrAlreadyApplied            = errors.New("already_applied")
	ErrRecipientNotFound         = errors.New("recipient_not_found")
	ErrRecipientNotApproved      = errors.New("recipient_not_approved")
	ErrNoBankOnFile              = errors.New("no_bank_on_file")
	ErrWeeklyCostTooSmall        = errors.New("weekly_cost_too_small")
	ErrInvalidDisbursementMethod = errors.New("invalid_disbursement_method")
	ErrPseudonymFailed           = errors.New("pseudonym_failed")
	ErrEmailNotVerified          = errors.New("email_not_verified")
	// ErrStewardCannotReceive — enforces the plan's zero-tolerance separation:
	// anyone in the steward role cannot also be a recipient. Blocks at apply
	// time so the conflict-of-interest never gets a foothold.
	ErrStewardCannotReceive = errors.New("steward_cannot_receive")
)

type RecipientService struct {
	repo     *repository.RecipientRepo
	users    *repository.UserRepo
	payments payments.DisbursementProvider
	db       *gorm.DB
}

func NewRecipientService(repo *repository.RecipientRepo, users *repository.UserRepo, p payments.DisbursementProvider, db *gorm.DB) *RecipientService {
	return &RecipientService{repo: repo, users: users, payments: p, db: db}
}

type ApplyInput struct {
	UserID             uuid.UUID
	WeeklyCostKobo     int64
	Situation          string
	DisbursementMethod string
}

func (s *RecipientService) Apply(input ApplyInput) (*models.Recipient, error) {
	if input.WeeklyCostKobo < 100 {
		return nil, ErrWeeklyCostTooSmall
	}

	// Zero-tolerance separation: stewards cannot also be recipients.
	// Checked at the entry point so the conflict never gets recorded.
	if s.users != nil {
		if u, err := s.users.FindByID(input.UserID); err == nil && u.IsSteward() {
			return nil, ErrStewardCannotReceive
		}
	}

	// DisbursementMethod is no longer a user choice. Every approved
	// recipient is credited to their internal wallet; they withdraw to
	// their own bank account via /wallet/withdraw on their own schedule.
	// The Recipient.DisbursementMethod column stays for historical rows
	// but is hardcoded "wallet" for new applications.
	method := "wallet"

	// Idempotent — return existing record if already applied.
	if existing, err := s.repo.FindByUserID(input.UserID); err == nil {
		return existing, nil
	}

	pseudo, err := s.mintUniquePseudonym()
	if err != nil {
		return nil, ErrPseudonymFailed
	}

	r := &models.Recipient{
		UserID:               input.UserID,
		PseudonymousID:       pseudo,
		Status:               "pending",
		DisbursementMethod:   method,
		IntakeWeeklyCostKobo: input.WeeklyCostKobo,
		IntakeSituation:      input.Situation,
	}
	if err := s.repo.Create(r); err != nil {
		return nil, err
	}

	audit.Record(s.db, input.UserID.String(), "recipient_applied", r.ID.String(), map[string]any{
		"pseudonymousId": r.PseudonymousID,
	})
	return r, nil
}

func (s *RecipientService) GetByUserID(userID uuid.UUID) (*models.Recipient, error) {
	r, err := s.repo.FindByUserID(userID)
	if err != nil {
		return nil, ErrRecipientNotFound
	}
	return r, nil
}

func (s *RecipientService) ResolveBank(ctx context.Context, bankCode, accountNumber string) (*payments.ResolvedAccount, error) {
	if s.payments == nil {
		return nil, ErrPaymentsNotConfigured
	}
	return s.payments.ResolveAccount(ctx, bankCode, accountNumber)
}

type SaveBankInput struct {
	UserID        uuid.UUID
	BankCode      string
	BankName      string
	AccountNumber string
}

func (s *RecipientService) SaveBank(ctx context.Context, input SaveBankInput) (*models.RecipientBankAccount, error) {
	if s.payments == nil {
		return nil, ErrPaymentsNotConfigured
	}
	r, err := s.repo.FindByUserID(input.UserID)
	if err != nil {
		return nil, ErrRecipientNotFound
	}
	if r.Status != "approved" {
		return nil, ErrRecipientNotApproved
	}

	resolved, err := s.payments.ResolveAccount(ctx, input.BankCode, input.AccountNumber)
	if err != nil {
		return nil, err
	}

	pr, err := s.payments.CreateTransferRecipient(ctx, payments.TransferRecipientRequest{
		Name:          resolved.AccountName,
		AccountNumber: resolved.AccountNumber,
		BankCode:      input.BankCode,
		Currency:      "NGN",
	})
	if err != nil {
		return nil, err
	}

	bank := &models.RecipientBankAccount{
		RecipientID:           r.ID,
		BankCode:              input.BankCode,
		BankName:              input.BankName,
		AccountNumber:         resolved.AccountNumber,
		AccountName:           resolved.AccountName,
		PaystackRecipientCode: pr.RecipientCode,
	}
	if err := s.repo.UpsertBank(bank); err != nil {
		return nil, err
	}

	audit.Record(s.db, input.UserID.String(), "recipient_bank_set", r.ID.String(), map[string]any{
		"pseudonymousId": r.PseudonymousID,
		"bankCode":       input.BankCode,
	})
	return bank, nil
}

func (s *RecipientService) GetBank(userID uuid.UUID) (*models.RecipientBankAccount, error) {
	r, err := s.repo.FindByUserID(userID)
	if err != nil {
		return nil, ErrRecipientNotFound
	}
	bank, err := s.repo.FindBank(r.ID)
	if err != nil {
		return nil, ErrNoBankOnFile
	}
	return bank, nil
}

func (s *RecipientService) mintUniquePseudonym() (string, error) {
	for range 10 {
		id, err := identity.NewPseudonymousID()
		if err != nil {
			return "", err
		}
		if _, err := s.repo.FindByPseudonymousID(id); err != nil {
			return id, nil
		}
	}
	return "", ErrPseudonymFailed
}
