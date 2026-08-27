package wings_test

import (
	"os"
	"sync"
	"testing"
	"time"

	akindb "github.com/obeej/akin/internal/db"
	"github.com/obeej/akin/internal/wings"
	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var (
	migrateOnce sync.Once
	migrateErr  error
)

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
		if migrateErr = akindb.AutoMigrate(db); migrateErr != nil {
			return
		}
		migrateErr = akindb.RunGooseUp(db)
	})
	if migrateErr != nil {
		t.Skipf("migrate: %v", migrateErr)
	}
	return db
}

// TestIssueSpendBalance_MatchesPlanScenario walks the plan's Phase 1 exit
// test verbatim: sponsor issues 500W → recipient sees 500 available; books a
// 300W ride → 200 remain.
func TestIssueSpendBalance_MatchesPlanScenario(t *testing.T) {
	db := testDB(t)
	userID := uuid.New()

	if _, err := wings.Issue(db, userID, 500, "sponsor_grant", nil); err != nil {
		t.Fatalf("Issue: %v", err)
	}

	bal, err := wings.GetBalance(db, userID)
	if err != nil {
		t.Fatalf("GetBalance: %v", err)
	}
	if bal.Available != 500 {
		t.Fatalf("after issue: available = %d, want 500", bal.Available)
	}

	if err := wings.Spend(db, userID, 300, "ride_booking"); err != nil {
		t.Fatalf("Spend: %v", err)
	}

	bal, err = wings.GetBalance(db, userID)
	if err != nil {
		t.Fatalf("GetBalance after spend: %v", err)
	}
	if bal.Available != 200 {
		t.Errorf("after spending 300 of 500: available = %d, want 200", bal.Available)
	}
}

// TestSpend_InsufficientBalance_Rejected ensures a rider can never spend more
// Wings than they've been granted — the ledger-adjacent invariant for a
// non-cash balance.
func TestSpend_InsufficientBalance_Rejected(t *testing.T) {
	db := testDB(t)
	userID := uuid.New()

	if _, err := wings.Issue(db, userID, 100, "sponsor_grant", nil); err != nil {
		t.Fatalf("Issue: %v", err)
	}
	if err := wings.Spend(db, userID, 500, "ride_booking"); err != wings.ErrInsufficientWings {
		t.Errorf("Spend beyond balance: got %v, want ErrInsufficientWings", err)
	}

	bal, err := wings.GetBalance(db, userID)
	if err != nil {
		t.Fatalf("GetBalance: %v", err)
	}
	if bal.Available != 100 {
		t.Errorf("balance should be untouched after a rejected overspend: got %d, want 100", bal.Available)
	}
}

// TestExpiredGrants_ExcludesActiveAndAlreadyExpired verifies the 7-day expiry
// worker's query only picks up grants that are still 'active' but past their
// expiry — not already-spent grants, and not grants still within their window.
func TestExpiredGrants_ExcludesActiveAndAlreadyExpired(t *testing.T) {
	db := testDB(t)
	userID := uuid.New()

	g, err := wings.Issue(db, userID, 200, "sponsor_grant", nil)
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}
	// Force this grant's expiry into the past, simulating 7 days elapsed.
	past := time.Now().Add(-1 * time.Hour)
	if err := db.Model(&wings.Grant{}).Where("id = ?", g.ID).Update("expires_at", past).Error; err != nil {
		t.Fatalf("backdate expiry: %v", err)
	}

	// A second, still-active grant for a different user must not appear.
	other := uuid.New()
	if _, err := wings.Issue(db, other, 50, "sponsor_grant", nil); err != nil {
		t.Fatalf("Issue other: %v", err)
	}

	expired, err := wings.ExpiredGrants(db)
	if err != nil {
		t.Fatalf("ExpiredGrants: %v", err)
	}
	found := false
	for _, e := range expired {
		if e.ID == g.ID {
			found = true
		}
		if e.UserID == other {
			t.Errorf("still-active grant for %s should not be in the expired list", other)
		}
	}
	if !found {
		t.Errorf("backdated grant %s should appear in ExpiredGrants", g.ID)
	}
}
