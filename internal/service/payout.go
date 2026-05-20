package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/obeej/akin/internal/audit"
	"github.com/obeej/akin/internal/models"
	"github.com/obeej/akin/internal/payments"
	"github.com/obeej/akin/internal/repository"
	"gorm.io/gorm"
)

var (
	ErrPayoutNotFound       = errors.New("payout_not_found")
	ErrAlreadyProcessed     = errors.New("already_processed")
	ErrSameSteward          = errors.New("same_steward")
	ErrSelfPayout           = errors.New("self_payout_forbidden")
	ErrExceedsWeeklyCap     = errors.New("exceeds_weekly_cap")
	ErrAmountTooSmallPayout = errors.New("amount_too_small")
)

type PayoutService struct {
	payouts    *repository.PayoutRepo
	recipients *repository.RecipientRepo
	stewards   *repository.StewardRepo
	payments   payments.DisbursementProvider
	wallet     *WalletService
	notify     *NotificationService
	attendance *AttendanceService
	mock       bool
	db         *gorm.DB
}

func NewPayoutService(
	payouts *repository.PayoutRepo,
	recipients *repository.RecipientRepo,
	stewards *repository.StewardRepo,
	p payments.DisbursementProvider,
	wallet *WalletService,
	notify *NotificationService,
	attendance *AttendanceService,
	mock bool,
	db *gorm.DB,
) *PayoutService {
	return &PayoutService{
		payouts:    payouts,
		recipients: recipients,
		stewards:   stewards,
		payments:   p,
		wallet:     wallet,
		notify:     notify,
		attendance: attendance,
		mock:       mock,
		db:         db,
	}
}

type InitiatePayoutInput struct {
	StewardID   uuid.UUID
	RecipientID uuid.UUID
	AmountKobo  int64
	Note        string
}

func (s *PayoutService) Initiate(input InitiatePayoutInput) (*models.Payout, error) {
	if input.AmountKobo < 100 {
		return nil, ErrAmountTooSmallPayout
	}
	r, err := s.recipients.FindByID(input.RecipientID)
	if err != nil {
		return nil, ErrRecipientNotFound
	}
	if r.Status != "approved" {
		return nil, ErrRecipientNotApproved
	}
	if r.UserID == input.StewardID {
		return nil, ErrSelfPayout
	}
	if r.WeeklyCapKobo > 0 && input.AmountKobo > r.WeeklyCapKobo {
		return nil, ErrExceedsWeeklyCap
	}
	// Bank required only for bank disbursement method.
	if r.DisbursementMethod == "bank" {
		if _, err := s.recipients.FindBank(r.ID); err != nil {
			return nil, ErrNoBankOnFile
		}
	}
	// Attendance gate — combined source (CSV uploads OR Ride Network boarded).
	// Skipped if no AttendanceService is wired (used by tests).
	if s.attendance != nil {
		if err := s.attendance.EligibleForPayout(r.UserID); err != nil {
			return nil, err
		}
	}

	payout := &models.Payout{
		RecipientID:   r.ID,
		AmountKobo:    input.AmountKobo,
		Status:        "awaiting_confirm",
		Reference:     "akin_payout_" + uuid.NewString(),
		InitiatedByID: input.StewardID,
	}
	if err := s.payouts.Create(payout); err != nil {
		return nil, err
	}

	if err := s.stewards.CreateAction(&models.StewardAction{
		StewardID:   input.StewardID,
		SubjectType: "payout",
		SubjectID:   payout.ID,
		Decision:    "approve",
		Note:        input.Note,
	}); err != nil {
		return nil, err
	}

	audit.Record(s.db, input.StewardID.String(), "payout_initiated", payout.ID.String(), map[string]any{
		"pseudonymousId": r.PseudonymousID,
		"amountKobo":     input.AmountKobo,
	})
	return payout, nil
}

func (s *PayoutService) Confirm(ctx context.Context, payoutID, stewardID uuid.UUID) (*models.Payout, error) {
	payout, err := s.payouts.FindByID(payoutID)
	if err != nil {
		return nil, ErrPayoutNotFound
	}
	if payout.Status != "awaiting_confirm" {
		return nil, ErrAlreadyProcessed
	}
	if payout.InitiatedByID == stewardID {
		return nil, ErrSameSteward
	}

	r, err := s.recipients.FindByID(payout.RecipientID)
	if err != nil {
		return nil, ErrRecipientNotFound
	}
	if r.UserID == stewardID {
		return nil, ErrSelfPayout
	}

	// Record second sign-off before any money moves — audit trail is immutable.
	if err := s.stewards.CreateAction(&models.StewardAction{
		StewardID:   stewardID,
		SubjectType: "payout",
		SubjectID:   payout.ID,
		Decision:    "approve",
	}); err != nil {
		return nil, err
	}

	// Wallet disbursement — no Paystack transfer needed.
	if r.DisbursementMethod == "wallet" {
		return s.confirmWallet(payout, r, stewardID)
	}

	bank, err := s.recipients.FindBank(r.ID)
	if err != nil {
		return nil, ErrNoBankOnFile
	}

	if s.mock {
		return s.confirmMock(payout, r, stewardID)
	}
	return s.confirmLive(ctx, payout, r, bank, stewardID)
}

func (s *PayoutService) confirmWallet(payout *models.Payout, r *models.Recipient, stewardID uuid.UUID) (*models.Payout, error) {
	now := time.Now()
	if err := s.payouts.Update(payout.ID, map[string]any{
		"status":          "succeeded",
		"confirmed_by_id": stewardID,
		"settled_at":      &now,
	}); err != nil {
		return nil, err
	}
	if s.wallet != nil {
		_ = s.wallet.Credit(r.UserID, payout.AmountKobo,
			"Support payout · "+r.PseudonymousID, payout.ID.String())
	}
	if s.notify != nil {
		_ = s.notify.Send(r.UserID, "payout_received",
			"Support payment received",
			fmt.Sprintf("₦%d has been added to your wallet.", payout.AmountKobo/100),
		)
	}
	audit.Record(s.db, stewardID.String(), "payout_confirmed_wallet", payout.ID.String(), map[string]any{
		"pseudonymousId": r.PseudonymousID,
		"amountKobo":     payout.AmountKobo,
	})
	return s.payouts.FindByID(payout.ID)
}

func (s *PayoutService) confirmMock(payout *models.Payout, r *models.Recipient, stewardID uuid.UUID) (*models.Payout, error) {
	now := time.Now()
	mockCode := "mock_" + payout.Reference
	if err := s.payouts.Update(payout.ID, map[string]any{
		"status":                 "succeeded",
		"paystack_transfer_code": mockCode,
		"confirmed_by_id":        stewardID,
		"settled_at":             &now,
	}); err != nil {
		return nil, err
	}
	if s.notify != nil {
		_ = s.notify.Send(r.UserID, "payout_received",
			"Support payment sent",
			fmt.Sprintf("₦%d has been sent to your bank account.", payout.AmountKobo/100),
		)
	}
	audit.Record(s.db, stewardID.String(), "payout_confirmed_mock", payout.ID.String(), map[string]any{
		"pseudonymousId": r.PseudonymousID,
		"amountKobo":     payout.AmountKobo,
		"transferCode":   mockCode,
		"mock":           true,
	})
	return s.payouts.FindByID(payout.ID)
}

func (s *PayoutService) confirmLive(ctx context.Context, payout *models.Payout, r *models.Recipient, bank *models.RecipientBankAccount, stewardID uuid.UUID) (*models.Payout, error) {
	if s.payments == nil {
		return nil, ErrPaymentsNotConfigured
	}
	resp, err := s.payments.InitiateTransfer(ctx, payments.TransferRequest{
		RecipientCode: bank.PaystackRecipientCode,
		AmountKobo:    payout.AmountKobo,
		Reference:     payout.Reference,
		Reason:        "Akin support · " + r.PseudonymousID,
	})
	if err != nil {
		_ = s.payouts.Update(payout.ID, map[string]any{
			"status":          "failed",
			"failure_reason":  err.Error(),
			"confirmed_by_id": stewardID,
		})
		audit.Record(s.db, stewardID.String(), "payout_transfer_failed", payout.ID.String(), map[string]any{"err": err.Error()})
		return nil, err
	}

	updates := map[string]any{
		"status":                 "pending",
		"paystack_transfer_code": resp.TransferCode,
		"confirmed_by_id":        stewardID,
	}
	if resp.Status == "success" {
		now := time.Now()
		updates["status"] = "succeeded"
		updates["settled_at"] = &now
		if s.notify != nil {
			_ = s.notify.Send(r.UserID, "payout_received",
				"Support payment sent",
				fmt.Sprintf("₦%d has been sent to your bank account.", payout.AmountKobo/100),
			)
		}
	}
	if err := s.payouts.Update(payout.ID, updates); err != nil {
		return nil, err
	}

	audit.Record(s.db, stewardID.String(), "payout_confirmed", payout.ID.String(), map[string]any{
		"pseudonymousId": r.PseudonymousID,
		"amountKobo":     payout.AmountKobo,
		"transferCode":   resp.TransferCode,
		"status":         resp.Status,
	})
	return s.payouts.FindByID(payout.ID)
}

func (s *PayoutService) List() ([]models.Payout, error) {
	return s.payouts.List(100)
}

func (s *PayoutService) ListCursor(cursor time.Time, limit int) ([]models.Payout, error) {
	return s.payouts.ListCursor(cursor, limit)
}

type ApprovedRecipient struct {
	models.Recipient
	HasBank     bool   `json:"hasBank"`
	BankName    string `json:"bankName,omitempty"`
	AccountName string `json:"accountName,omitempty"`
}

func (s *PayoutService) ApprovedRecipients() ([]ApprovedRecipient, error) {
	rs, err := s.recipients.ListApproved()
	if err != nil {
		return nil, err
	}
	out := make([]ApprovedRecipient, 0, len(rs))
	for _, r := range rs {
		ar := ApprovedRecipient{Recipient: r}
		if bank, err := s.recipients.FindBank(r.ID); err == nil {
			ar.HasBank = true
			ar.BankName = bank.BankName
			ar.AccountName = bank.AccountName
		}
		out = append(out, ar)
	}
	return out, nil
}

// SettleByReference is called by the webhook handler for transfer.success events.
func (s *PayoutService) SettleByReference(reference string) error {
	payout, err := s.payouts.FindByReference(reference)
	if err != nil {
		return ErrPayoutNotFound
	}
	if payout.Status == "succeeded" {
		return nil
	}
	now := time.Now()
	if err := s.payouts.Update(payout.ID, map[string]any{"status": "succeeded", "settled_at": &now}); err != nil {
		return err
	}
	// Notify recipient on webhook-confirmed transfer.
	r, err := s.recipients.FindByID(payout.RecipientID)
	if err == nil && s.notify != nil {
		_ = s.notify.Send(r.UserID, "payout_received",
			"Support payment sent",
			fmt.Sprintf("₦%d has been sent to your bank account.", payout.AmountKobo/100),
		)
	}
	return nil
}
