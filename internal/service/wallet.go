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

func formatKobo(kobo int64) string {
	naira := kobo / 100
	return fmt.Sprintf("%d", naira)
}
