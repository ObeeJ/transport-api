package service

import (
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/obeej/akin/internal/audit"
	"github.com/obeej/akin/internal/ledger"
	"github.com/obeej/akin/internal/models"
	"github.com/obeej/akin/internal/outbox"
	"github.com/obeej/akin/internal/repository"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	ErrInsufficientBalance = errors.New("insufficient_balance")
	ErrWalletNotFound      = errors.New("wallet_not_found")
)

// poolAccountID is the virtual account ID used as the counter-party for
// fund-pool movements. It is a fixed sentinel UUID, not a real wallet row.
var poolAccountID = uuid.MustParse("00000000-0000-0000-0000-000000000002")

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

// Credit atomically credits a wallet, writes a double-entry ledger pair,
// and emits an outbox event — all inside a single DB transaction.
func (s *WalletService) Credit(userID uuid.UUID, amountKobo int64, description, refID string) error {
	txnID := uuid.New()
	return s.db.Transaction(func(tx *gorm.DB) error {
		var w models.Wallet
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("user_id = ?", userID).FirstOrCreate(&w).Error; err != nil {
			return err
		}
		balanceBefore := w.BalanceKobo
		w.BalanceKobo += amountKobo
		if err := tx.Save(&w).Error; err != nil {
			return err
		}
		wtx := models.WalletTransaction{
			WalletID: w.ID, UserID: userID,
			Type: "credit", AmountKobo: amountKobo,
			BalanceKobo: w.BalanceKobo, Description: description, RefID: refID,
		}
		if err := tx.Create(&wtx).Error; err != nil {
			return err
		}
		// Double-entry: pool debits, user wallet credits.
		if err := ledger.Write(tx, txnID,
			ledger.Account{ID: poolAccountID},
			ledger.Account{ID: w.ID},
			amountKobo, description,
			balanceBefore, // pool balance tracking not enforced here — sentinel account
			w.BalanceKobo,
			map[string]any{"ref_id": refID},
		); err != nil {
			return err
		}
		if err := outbox.Emit(tx, userID, "wallet.credited", map[string]any{
			"user_id":      userID,
			"amount_kobo":  amountKobo,
			"balance_kobo": w.BalanceKobo,
			"ref_id":       refID,
		}); err != nil {
			return err
		}
		audit.Record(tx, "system", "wallet_credited", userID.String(), map[string]any{
			"amountKobo": amountKobo, "balanceKobo": w.BalanceKobo, "refId": refID,
		})
		_ = s.notify.Send(userID, "wallet_credited",
			"Your wallet has been credited",
			fmt.Sprintf("₦%s has been added to your wallet.", formatKobo(amountKobo)),
		)
		return nil
	})
}

// Debit atomically debits a wallet with ledger + outbox inside one transaction.
func (s *WalletService) Debit(userID uuid.UUID, amountKobo int64, description, refID string) error {
	txnID := uuid.New()
	return s.db.Transaction(func(tx *gorm.DB) error {
		var w models.Wallet
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("user_id = ?", userID).First(&w).Error; err != nil {
			return err
		}
		if w.BalanceKobo < amountKobo {
			return ErrInsufficientBalance
		}
		balanceBefore := w.BalanceKobo
		w.BalanceKobo -= amountKobo
		if err := tx.Save(&w).Error; err != nil {
			return err
		}
		wtx := models.WalletTransaction{
			WalletID: w.ID, UserID: userID,
			Type: "debit", AmountKobo: amountKobo,
			BalanceKobo: w.BalanceKobo, Description: description, RefID: refID,
		}
		if err := tx.Create(&wtx).Error; err != nil {
			return err
		}
		// Double-entry: user wallet debits, pool credits.
		if err := ledger.Write(tx, txnID,
			ledger.Account{ID: w.ID},
			ledger.Account{ID: poolAccountID},
			amountKobo, description,
			w.BalanceKobo,
			balanceBefore, // pool balance tracking not enforced here — sentinel account
			map[string]any{"ref_id": refID},
		); err != nil {
			return err
		}
		if err := outbox.Emit(tx, userID, "wallet.debited", map[string]any{
			"user_id":      userID,
			"amount_kobo":  amountKobo,
			"balance_kobo": w.BalanceKobo,
			"ref_id":       refID,
		}); err != nil {
			return err
		}
		audit.Record(tx, userID.String(), "wallet_debited", userID.String(), map[string]any{
			"amountKobo": amountKobo, "refId": refID,
		})
		return nil
	})
}

// CreditOnce — idempotent credit keyed on refID.
func (s *WalletService) CreditOnce(userID uuid.UUID, amountKobo int64, description, refID string) (bool, error) {
	if refID == "" {
		return false, fmt.Errorf("CreditOnce requires a non-empty refID")
	}
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
	return fmt.Sprintf("%d", kobo/100)
}
