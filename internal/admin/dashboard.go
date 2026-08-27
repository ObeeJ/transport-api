// Package admin provides metrics aggregation and admin action logging.
package admin

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Metrics struct {
	ActiveUsers       int64 `json:"activeUsers"`
	PendingDrivers    int64 `json:"pendingDrivers"`
	PendingReports    int64 `json:"pendingReports"`
	PendingPayouts    int64 `json:"pendingPayouts"`
	PoolBalanceKobo   int64 `json:"poolBalanceKobo"`
	TotalWingsIssued  int64 `json:"totalWingsIssued"`
	OpenEscrowKobo    int64 `json:"openEscrowKobo"`
	TrustEscalations  int64 `json:"trustEscalations"`
}

func GetMetrics(db *gorm.DB) (Metrics, error) {
	var m Metrics
	db.Raw("SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '30 days'").Scan(&m.ActiveUsers)
	db.Raw("SELECT COUNT(*) FROM driver_profiles WHERE status = 'pending'").Scan(&m.PendingDrivers)
	db.Raw("SELECT COUNT(*) FROM admin_actions WHERE action LIKE 'report_%' AND created_at > NOW() - INTERVAL '7 days'").Scan(&m.PendingReports)
	db.Raw("SELECT COUNT(*) FROM payouts WHERE status = 'pending'").Scan(&m.PendingPayouts)
	db.Raw("SELECT COALESCE(SUM(balance_kobo),0) FROM wallets").Scan(&m.PoolBalanceKobo)
	db.Raw("SELECT COALESCE(SUM(amount),0) FROM wings_grants WHERE status IN ('active','locked')").Scan(&m.TotalWingsIssued)
	db.Raw("SELECT COALESCE(SUM(amount_kobo),0) FROM escrow_holds WHERE state = 'held'").Scan(&m.OpenEscrowKobo)
	db.Raw("SELECT COUNT(*) FROM trust_scores WHERE score < 30").Scan(&m.TrustEscalations)
	return m, nil
}

// LogAction records an admin action for audit purposes.
func LogAction(db *gorm.DB, adminID uuid.UUID, targetUser, targetRide *uuid.UUID, action, reason string, evidence map[string]any) error {
	type AdminAction struct {
		ID         uuid.UUID  `gorm:"type:uuid;primaryKey"`
		AdminID    uuid.UUID  `gorm:"type:uuid;not null"`
		TargetUser *uuid.UUID `gorm:"type:uuid"`
		TargetRide *uuid.UUID `gorm:"type:uuid"`
		Action     string     `gorm:"not null"`
		Reason     string     `gorm:"not null"`
		Evidence   []byte     `gorm:"type:jsonb"`
		CreatedAt  time.Time
	}
	a := AdminAction{
		ID:         uuid.New(),
		AdminID:    adminID,
		TargetUser: targetUser,
		TargetRide: targetRide,
		Action:     action,
		Reason:     reason,
		CreatedAt:  time.Now(),
	}
	return db.Table("admin_actions").Create(&a).Error
}
