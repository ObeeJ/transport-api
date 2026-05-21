package service

import (
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/obeej/akin/internal/audit"
	"github.com/obeej/akin/internal/models"
	"github.com/obeej/akin/internal/repository"
	"gorm.io/gorm"
)

var (
	ErrInsufficientBalance = errors.New("insufficient_balance")
	ErrWalletNotFound      = errors.New("wallet_not_found")
)

type WalletService struct {
	repo   *repository.WalletRepo
	notify *NotificationService
	db     *gorm.DB
}

func NewWalletService(repo *repository.WalletRepo, notify *NotificationService, db *gorm.DB) *WalletService {
	return &WalletService{repo: repo, notify: notify, db: db}
}

func (s *WalletService) Balance(userID uuid.UUID) (*models.Wallet, error) {
	w, err := s.repo.FindOrCreate(userID)
	if err != nil {
		return nil, ErrWalletNotFound
	}
	return w, nil
}

func (s *WalletService) Transactions(userID uuid.UUID) ([]models.WalletTransaction, error) {
	return s.repo.ListTransactions(userID, 50)
}

// Credit is called by PayoutService when a wallet recipient is paid.
func (s *WalletService) Credit(userID uuid.UUID, amountKobo int64, description, refID string) error {
	tx, err := s.repo.Credit(userID, amountKobo, description, refID)
	if err != nil {
		return err
	}
	audit.Record(s.db, "system", "wallet_credited", userID.String(), map[string]any{
		"amountKobo":  amountKobo,
		"balanceKobo": tx.BalanceKobo,
		"refId":       refID,
	})
	_ = s.notify.Send(userID, "wallet_credited",
		"Your wallet has been credited",
		fmt.Sprintf("₦%s has been added to your wallet.", formatKobo(amountKobo)),
	)
	return nil
}

// Debit is called when a user withdraws or spends from their wallet.
func (s *WalletService) Debit(userID uuid.UUID, amountKobo int64, description, refID string) error {
	_, err := s.repo.Debit(userID, amountKobo, description, refID)
	if err != nil {
		if errors.Is(err, repository.ErrInsufficientBalance) {
			return ErrInsufficientBalance
		}
		return err
	}
	audit.Record(s.db, userID.String(), "wallet_debited", userID.String(), map[string]any{
		"amountKobo": amountKobo,
		"refId":      refID,
	})
	return nil
}

// CreditOnce — idempotent credit keyed on `refID`. Returns
// (credited=true, nil) when a new transaction was inserted, or
// (credited=false, nil) when a prior transaction with the same refID
// already existed. Used by the weekly cron so re-running the job — or
// running it multiple times within the same week — doesn't double-credit.
func (s *WalletService) CreditOnce(userID uuid.UUID, amountKobo int64, description, refID string) (bool, error) {
	if refID == "" {
		// Refuse — idempotency requires a stable key. Use Credit() for one-shot ops.
		return false, fmt.Errorf("CreditOnce requires a non-empty refID")
	}
	// Cheap dedupe check first; race-tolerant because we then rely on the
	// (eventually-added) unique index on wallet_transactions.ref_id to
	// reject a concurrent dup at insert time. For v1 the check + insert
	// race is acceptable — the cron runs single-process.
	var n int64
	if err := s.db.Model(&models.WalletTransaction{}).
		Where("ref_id = ?", refID).Count(&n).Error; err != nil {
		return false, err
	}
	if n > 0 {
		return false, nil
	}
	if err := s.Credit(userID, amountKobo, description, refID); err != nil {
		return false, err
	}
	return true, nil
}

func formatKobo(kobo int64) string {
	naira := kobo / 100
	return fmt.Sprintf("%d", naira)
}
