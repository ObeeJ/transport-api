package repository

import (
	"github.com/google/uuid"
	"github.com/obeej/akin/internal/models"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type WalletRepo struct{ db *gorm.DB }

func NewWalletRepo(db *gorm.DB) *WalletRepo { return &WalletRepo{db} }

func (r *WalletRepo) FindOrCreate(userID uuid.UUID) (*models.Wallet, error) {
	w := &models.Wallet{UserID: userID}
	err := r.db.Where("user_id = ?", userID).FirstOrCreate(w).Error
	return w, err
}

func (r *WalletRepo) FindByUserID(userID uuid.UUID) (*models.Wallet, error) {
	var w models.Wallet
	return &w, r.db.Where("user_id = ?", userID).First(&w).Error
}

// Credit adds amountKobo to the wallet and appends a ledger entry atomically.
func (r *WalletRepo) Credit(userID uuid.UUID, amountKobo int64, description, refID string) (*models.WalletTransaction, error) {
	var tx models.WalletTransaction
	err := r.db.Transaction(func(db *gorm.DB) error {
		var w models.Wallet
		// Lock the row for update to prevent concurrent balance drift.
		if err := db.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("user_id = ?", userID).FirstOrCreate(&w).Error; err != nil {
			return err
		}
		w.BalanceKobo += amountKobo
		if err := db.Save(&w).Error; err != nil {
			return err
		}
		tx = models.WalletTransaction{
			WalletID:    w.ID,
			UserID:      userID,
			Type:        "credit",
			AmountKobo:  amountKobo,
			BalanceKobo: w.BalanceKobo,
			Description: description,
			RefID:       refID,
		}
		return db.Create(&tx).Error
	})
	return &tx, err
}

// Debit subtracts amountKobo. Returns error if balance would go negative.
func (r *WalletRepo) Debit(userID uuid.UUID, amountKobo int64, description, refID string) (*models.WalletTransaction, error) {
	var tx models.WalletTransaction
	err := r.db.Transaction(func(db *gorm.DB) error {
		var w models.Wallet
		if err := db.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("user_id = ?", userID).First(&w).Error; err != nil {
			return err
		}
		if w.BalanceKobo < amountKobo {
			return ErrInsufficientBalance
		}
		w.BalanceKobo -= amountKobo
		if err := db.Save(&w).Error; err != nil {
			return err
		}
		tx = models.WalletTransaction{
			WalletID:    w.ID,
			UserID:      userID,
			Type:        "debit",
			AmountKobo:  amountKobo,
			BalanceKobo: w.BalanceKobo,
			Description: description,
			RefID:       refID,
		}
		return db.Create(&tx).Error
	})
	return &tx, err
}

func (r *WalletRepo) ListTransactions(userID uuid.UUID, limit int) ([]models.WalletTransaction, error) {
	var items []models.WalletTransaction
	return items, r.db.Where("user_id = ?", userID).
		Order("created_at desc").Limit(limit).Find(&items).Error
}

var ErrInsufficientBalance = gorm.ErrInvalidData
