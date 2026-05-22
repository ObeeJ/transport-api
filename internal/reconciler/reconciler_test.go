package reconciler_test

import (
	"os"
	"sync"
	"testing"
	"time"

	akindb "github.com/obeej/akin/internal/db"
	"github.com/obeej/akin/internal/models"
	"github.com/obeej/akin/internal/reconciler"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var migrateOnce sync.Once

func testDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://akin:akin_dev@localhost:55432/akin?sslmode=disable"
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Skipf("postgres unavailable: %v", err)
	}
	migrateOnce.Do(func() {
		if err := akindb.AutoMigrate(db); err != nil {
			t.Fatalf("auto-migrate: %v", err)
		}
	})
	return db
}

func TestReconciler_ExpiresStalePendingDeposits(t *testing.T) {
	db := testDB(t)

	stale := models.GiverDeposit{
		Status:            "pending",
		AmountKobo:        100,
		PaystackReference: "rec-test-stale-" + t.Name(),
		CreatedAt:         time.Now().Add(-3 * time.Hour),
	}
	fresh := models.GiverDeposit{
		Status:            "pending",
		AmountKobo:        100,
		PaystackReference: "rec-test-fresh-" + t.Name(),
		CreatedAt:         time.Now(),
	}
	db.Create(&stale)
	db.Create(&fresh)
	t.Cleanup(func() {
		db.Unscoped().Delete(&stale)
		db.Unscoped().Delete(&fresh)
	})

	reconciler.New(db, time.Hour).RunOnce()

	var s, f models.GiverDeposit
	db.First(&s, stale.ID)
	db.First(&f, fresh.ID)

	if s.Status != "failed" {
		t.Errorf("stale deposit: want failed, got %s", s.Status)
	}
	if f.Status != "pending" {
		t.Errorf("fresh deposit: want pending, got %s", f.Status)
	}
}

func TestReconciler_ExpiresStalePendingPayouts(t *testing.T) {
	db := testDB(t)

	stale := models.Payout{
		Status:        "pending",
		AmountKobo:    100,
		Reference:     "rec-test-stale-payout-" + t.Name(),
		CreatedAt:     time.Now().Add(-25 * time.Hour),
	}
	fresh := models.Payout{
		Status:     "pending",
		AmountKobo: 100,
		Reference:  "rec-test-fresh-payout-" + t.Name(),
		CreatedAt:  time.Now(),
	}
	db.Create(&stale)
	db.Create(&fresh)
	t.Cleanup(func() {
		db.Unscoped().Delete(&stale)
		db.Unscoped().Delete(&fresh)
	})

	reconciler.New(db, time.Hour).RunOnce()

	var s, f models.Payout
	db.First(&s, stale.ID)
	db.First(&f, fresh.ID)

	if s.Status != "failed" {
		t.Errorf("stale payout: want failed, got %s", s.Status)
	}
	if s.FailureReason != "reconciler_timeout" {
		t.Errorf("stale payout failure reason: want reconciler_timeout, got %s", s.FailureReason)
	}
	if f.Status != "pending" {
		t.Errorf("fresh payout: want pending, got %s", f.Status)
	}
}

func TestReconciler_CancelsPastDepartureTrips(t *testing.T) {
	db := testDB(t)

	past := models.Trip{
		Status:      "published",
		Destination: "Test",
		DepartureAt: time.Now().Add(-2 * time.Hour),
	}
	future := models.Trip{
		Status:      "published",
		Destination: "Test",
		DepartureAt: time.Now().Add(2 * time.Hour),
	}
	db.Create(&past)
	db.Create(&future)
	t.Cleanup(func() {
		db.Unscoped().Delete(&past)
		db.Unscoped().Delete(&future)
	})

	reconciler.New(db, time.Hour).RunOnce()

	var p, f models.Trip
	db.First(&p, past.ID)
	db.First(&f, future.ID)

	if p.Status != "cancelled" {
		t.Errorf("past trip: want cancelled, got %s", p.Status)
	}
	if p.CancelReason != "auto_expired" {
		t.Errorf("past trip cancel reason: want auto_expired, got %s", p.CancelReason)
	}
	if f.Status != "published" {
		t.Errorf("future trip: want published, got %s", f.Status)
	}
}

func TestReconciler_DeletesExpiredSessions(t *testing.T) {
	db := testDB(t)

	expired := models.Session{TokenHash: "rec-test-expired-" + t.Name(), ExpiresAt: time.Now().Add(-time.Hour)}
	active := models.Session{TokenHash: "rec-test-active-" + t.Name(), ExpiresAt: time.Now().Add(time.Hour)}
	db.Create(&expired)
	db.Create(&active)
	t.Cleanup(func() {
		db.Unscoped().Delete(&active)
	})

	reconciler.New(db, time.Hour).RunOnce()

	var count int64
	db.Model(&models.Session{}).Where("token_hash IN ?", []string{expired.TokenHash, active.TokenHash}).Count(&count)
	if count != 1 {
		t.Errorf("want 1 session remaining, got %d", count)
	}
}
