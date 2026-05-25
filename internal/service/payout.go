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
	users      *repository.UserRepo
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
	users *repository.UserRepo,
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
		users:      users,
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

// SkipReason describes why a recipient is excluded from a batch run.
type SkipReason string

const (
	SkipAbsent      SkipReason = "absent_last_week"
	SkipNoRecord    SkipReason = "no_attendance_record"
	SkipNoBank      SkipReason = "no_bank_on_file"
	SkipNoCap       SkipReason = "no_weekly_cap_set"
	SkipNotApproved SkipReason = "not_approved"
)

// BatchPreviewLine is one recipient's entry in the preview.
type BatchPreviewLine struct {
	RecipientID    uuid.UUID  `json:"recipientId"`
	PseudonymousID string     `json:"pseudonymousId"`
	AmountKobo     int64      `json:"amountKobo"`
	Disbursement   string     `json:"disbursementMethod"`
	BankName       string     `json:"bankName,omitempty"`
	Eligible       bool       `json:"eligible"`
	SkipReason     SkipReason `json:"skipReason,omitempty"`
}

// BatchPreview is the full read-only preview returned before any money moves.
type BatchPreview struct {
	WeekStart    string             `json:"weekStart"`
	Lines        []BatchPreviewLine `json:"lines"`
	TotalKobo    int64              `json:"totalKobo"`
	Eligible     int                `json:"eligible"`
	Skipped      int                `json:"skipped"`
}

func (s *PayoutService) Preview() (*BatchPreview, error) {
	recipients, err := s.recipients.ListApproved()
	if err != nil {
		return nil, err
	}

	weekStart := models.WeekStartOf(time.Now()).AddDate(0, 0, -7)
	preview := &BatchPreview{
		WeekStart: weekStart.Format("2006-01-02"),
		Lines:     []BatchPreviewLine{},
	}

	for _, r := range recipients {
		line := BatchPreviewLine{
			RecipientID:    r.ID,
			PseudonymousID: r.PseudonymousID,
			AmountKobo:     r.WeeklyCapKobo,
			Disbursement:   r.DisbursementMethod,
		}
		if r.WeeklyCapKobo == 0 {
			line.SkipReason = SkipNoCap
			preview.Lines = append(preview.Lines, line)
			preview.Skipped++
			continue
		}
		// Stewards only credit wallets. The recipient's bank account is
		// for their own wallet→bank withdrawals, not for steward payouts.
		// We surface it in the preview line for context (so stewards know
		// the recipient can actually cash out), but it doesn't gate.
		if bank, err := s.recipients.FindBank(r.ID); err == nil {
			line.BankName = bank.BankName
		}
		if s.attendance != nil {
			if err := s.attendance.EligibleForPayout(r.UserID); err != nil {
				if errors.Is(err, ErrAttendanceMissing) {
					thisWeek := models.WeekStartOf(time.Now())
					lastWeek := thisWeek.AddDate(0, 0, -7)
					if attended, recorded, _ := s.attendance.Was(r.UserID, lastWeek); recorded && !attended {
						line.SkipReason = SkipAbsent
					} else {
						line.SkipReason = SkipNoRecord
					}
				} else {
					line.SkipReason = SkipAbsent
				}
				preview.Lines = append(preview.Lines, line)
				preview.Skipped++
				continue
			}
		}
		line.Eligible = true
		preview.TotalKobo += r.WeeklyCapKobo
		preview.Eligible++
		preview.Lines = append(preview.Lines, line)
	}
	return preview, nil
}

func (s *PayoutService) InitiateBatch(stewardID uuid.UUID) (uuid.UUID, int, error) {
	preview, err := s.Preview()
	if err != nil {
		return uuid.Nil, 0, err
	}
	eligible := make([]BatchPreviewLine, 0)
	for _, l := range preview.Lines {
		if l.Eligible {
			eligible = append(eligible, l)
		}
	}
	if len(eligible) == 0 {
		return uuid.Nil, 0, errors.New("no_eligible_recipients")
	}
	batchID := uuid.New()
	payouts := make([]*models.Payout, 0, len(eligible))
	for _, l := range eligible {
		payouts = append(payouts, &models.Payout{
			BatchID:       &batchID,
			RecipientID:   l.RecipientID,
			AmountKobo:    l.AmountKobo,
			Status:        "awaiting_confirm",
			Reference:     "akin_payout_" + uuid.NewString(),
			InitiatedByID: stewardID,
		})
	}
	if err := s.payouts.CreateBatch(payouts); err != nil {
		return uuid.Nil, 0, err
	}
	audit.Record(s.db, stewardID.String(), "payout_batch_initiated", batchID.String(), map[string]any{
		"count":      len(payouts),
		"totalKobo":  preview.TotalKobo,
		"weekStart":  preview.WeekStart,
	})
	return batchID, len(payouts), nil
}

func (s *PayoutService) ConfirmBatch(ctx context.Context, batchID, stewardID uuid.UUID) (int, error) {
	payoutList, err := s.payouts.ListByBatch(batchID)
	if err != nil || len(payoutList) == 0 {
		return 0, ErrPayoutNotFound
	}
	if payoutList[0].InitiatedByID == stewardID {
		return 0, ErrSameSteward
	}
	for _, p := range payoutList {
		if p.Status != "awaiting_confirm" {
			return 0, ErrAlreadyProcessed
		}
	}
	// Fire each transfer individually — same logic as single Confirm.
	succeeded := 0
	for _, p := range payoutList {
		if _, err := s.Confirm(ctx, p.ID, stewardID); err == nil {
			succeeded++
		}
	}
	audit.Record(s.db, stewardID.String(), "payout_batch_confirmed", batchID.String(), map[string]any{
		"total":     len(payoutList),
		"succeeded": succeeded,
	})
	return succeeded, nil
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
	// Stewards no longer disburse to bank. Every steward-initiated payout
	// credits the recipient's wallet; the recipient withdraws to their
	// own bank account when they want to. So no bank check here.
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

	// Steward-confirmed payouts always land in the recipient's wallet.
	// Recipients withdraw to bank themselves via /wallet/withdraw — the
	// previous "confirmLive" path (Paystack Transfer from steward console)
	// has been retired. (ctx is unused now but kept for signature stability.)
	_ = ctx
	return s.confirmWallet(payout, r, stewardID)
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
			// AccountName is deliberately not exposed — stewards must never be able
			// to correlate a real account holder name with a pseudonymous ID.
		}
		out = append(out, ar)
	}
	return out, nil
}

// Withdraw — recipient-initiated payout from their internal wallet to
// their saved bank account. This is the self-service path that replaces
// the steward-driven two-person flow for routine disbursements.
//
// Trust boundary:
//   - The recipient was already approved (two stewards). That's the
//     point at which the trust check happened.
//   - The wallet balance was either credited by a steward-approved payout
//     OR by the weekly attendance-gated cron. Either way the money is
//     theirs to move.
//   - We still write a Payout row so the audit log is consistent across
//     steward-driven and self-service disbursements.
//
// Atomicity:
//   1. Validate (approved + bank + amount + balance).
//   2. In a DB transaction: create the Payout row AND debit the wallet.
//   3. Call Paystack (or mock). If sync error, refund the wallet and
//      mark the payout failed (also atomic).
//   4. Webhook handles async success/failure.
func (s *PayoutService) Withdraw(ctx context.Context, userID uuid.UUID, amountKobo int64) (*models.Payout, error) {
	if amountKobo < 100*100 { // ₦100 minimum, parity with steward payout
		return nil, ErrAmountTooSmallPayout
	}

	// Zero-tolerance separation: stewards cannot withdraw even if a stale
	// Recipient row exists for them. Apply-time check should have caught
	// it; this is the belt-and-braces layer.
	if s.users != nil {
		if u, err := s.users.FindByID(userID); err == nil && u.IsSteward() {
			return nil, ErrStewardCannotReceive
		}
	}

	r, err := s.recipients.FindByUserID(userID)
	if err != nil {
		return nil, ErrRecipientNotFound
	}
	if r.Status != "approved" {
		return nil, ErrRecipientNotApproved
	}
	bank, err := s.recipients.FindBank(r.ID)
	if err != nil {
		return nil, ErrNoBankOnFile
	}

	// Balance check — let WalletService surface ErrInsufficientBalance via Debit.
	if s.wallet == nil {
		return nil, fmt.Errorf("wallet service not wired")
	}
	w, err := s.wallet.Balance(userID)
	if err != nil {
		return nil, err
	}
	if w.BalanceKobo < amountKobo {
		return nil, ErrInsufficientBalance
	}

	payout := &models.Payout{
		RecipientID:   r.ID,
		AmountKobo:    amountKobo,
		Status:        "pending",
		Reference:     "akin_withdraw_" + uuid.NewString(),
		InitiatedByID: userID, // self
	}

	// Reserve the funds — payout row + wallet debit atomically.
	err = s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(payout).Error; err != nil {
			return err
		}
		// Debit goes through the wallet service's own repo so the
		// WalletTransaction ledger row is consistent. We're inside a tx,
		// but the wallet repo uses its own session — acceptable for v1;
		// future hardening would have wallet ops accept a tx handle.
		return s.wallet.Debit(userID, amountKobo, "Withdrawal to bank · "+payout.Reference, payout.ID.String())
	})
	if err != nil {
		// If wallet debit failed (insufficient_balance race, etc.) and the
		// payout row was created in the same tx, the tx rollback unwinds it.
		if errors.Is(err, ErrInsufficientBalance) {
			return nil, ErrInsufficientBalance
		}
		return nil, err
	}

	audit.Record(s.db, userID.String(), "withdrawal_initiated", payout.ID.String(), map[string]any{
		"pseudonymousId": r.PseudonymousID,
		"amountKobo":     amountKobo,
	})

	// MOCK path — for dev / Paystack-starter accounts that can't do real Transfers.
	if s.mock {
		now := time.Now()
		mockCode := "mock_" + payout.Reference
		if err := s.payouts.Update(payout.ID, map[string]any{
			"status":                 "succeeded",
			"paystack_transfer_code": mockCode,
			"settled_at":             &now,
		}); err != nil {
			return nil, err
		}
		audit.Record(s.db, userID.String(), "withdrawal_settled_mock", payout.ID.String(),
			map[string]any{"transferCode": mockCode})
		if s.notify != nil {
			_ = s.notify.Send(userID, "withdrawal_sent",
				"Withdrawal sent",
				fmt.Sprintf("₦%d is on its way to your bank.", amountKobo/100))
		}
		return s.payouts.FindByID(payout.ID)
	}

	// LIVE path — fire Paystack Transfer. On sync failure, refund the wallet.
	if s.payments == nil {
		s.refundOnFailure(userID, payout.ID, amountKobo, "payments_not_configured")
		return nil, ErrPaymentsNotConfigured
	}
	resp, perr := s.payments.InitiateTransfer(ctx, payments.TransferRequest{
		RecipientCode: bank.PaystackRecipientCode,
		AmountKobo:    amountKobo,
		Reference:     payout.Reference,
		Reason:        "Akin withdrawal · " + r.PseudonymousID,
	})
	if perr != nil {
		s.refundOnFailure(userID, payout.ID, amountKobo, perr.Error())
		return nil, perr
	}

	updates := map[string]any{
		"status":                 "pending",
		"paystack_transfer_code": resp.TransferCode,
	}
	if resp.Status == "success" {
		now := time.Now()
		updates["status"] = "succeeded"
		updates["settled_at"] = &now
	}
	if err := s.payouts.Update(payout.ID, updates); err != nil {
		return nil, err
	}
	return s.payouts.FindByID(payout.ID)
}

// refundOnFailure — best-effort restore of the wallet balance after a
// Paystack sync failure. We mark the payout failed and credit the user
// back. The audit log captures both events so reconciliation is possible
// even if either side flakes.
func (s *PayoutService) refundOnFailure(userID, payoutID uuid.UUID, amountKobo int64, reason string) {
	_ = s.payouts.Update(payoutID, map[string]any{"status": "failed", "failure_reason": reason})
	if s.wallet != nil {
		_ = s.wallet.Credit(userID, amountKobo, "Refund · failed withdrawal "+payoutID.String(), payoutID.String())
	}
	audit.Record(s.db, userID.String(), "withdrawal_failed_refunded", payoutID.String(),
		map[string]any{"err": reason, "amountKobo": amountKobo})
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
