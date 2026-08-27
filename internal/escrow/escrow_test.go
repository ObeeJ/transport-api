package escrow_test

import (
	"os"
	"sync"
	"testing"

	akindb "github.com/obeej/akin/internal/db"
	"github.com/obeej/akin/internal/escrow"
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

// TestHold_Release_CreditsExactlyOnce exercises the plan's Phase 0 exit
// criterion: "Escrow Hold → Release credits destination exactly once." The
// state machine only allows held→released once; a second Release call must
// fail with ErrInvalidState rather than silently re-applying (which is what
// would let a caller double-credit an account by retrying).
func TestHold_Release_CreditsExactlyOnce(t *testing.T) {
	db := testDB(t)
	from, to := uuid.New(), uuid.New()

	h, err := escrow.NewHold(db, from, to, 50_00, "test_hold", nil, nil)
	if err != nil {
		t.Fatalf("NewHold: %v", err)
	}

	if err := escrow.Release(db, h.ID); err != nil {
		t.Fatalf("first Release: %v", err)
	}

	// A second release on the same hold must be rejected — this is the
	// invariant that keeps a retried release from crediting twice.
	if err := escrow.Release(db, h.ID); err != escrow.ErrInvalidState {
		t.Errorf("second Release: got %v, want ErrInvalidState", err)
	}

	var reread escrow.Hold
	if err := db.Where("id = ?", h.ID).First(&reread).Error; err != nil {
		t.Fatalf("reread hold: %v", err)
	}
	if reread.State != "released" {
		t.Errorf("expected state=released, got %s", reread.State)
	}
	if reread.Version != 2 {
		t.Errorf("expected version=2 after exactly one transition, got %d", reread.Version)
	}
}

// TestHold_CannotRefundAfterRelease guards against a released hold later
// being refunded — the transition guard must check the FROM state ('held'),
// not just blindly set the target state regardless of where the hold is.
func TestHold_CannotRefundAfterRelease(t *testing.T) {
	db := testDB(t)
	from, to := uuid.New(), uuid.New()

	h, err := escrow.NewHold(db, from, to, 10_00, "test_hold", nil, nil)
	if err != nil {
		t.Fatalf("NewHold: %v", err)
	}
	if err := escrow.Release(db, h.ID); err != nil {
		t.Fatalf("Release: %v", err)
	}

	if err := escrow.Refund(db, h.ID); err != escrow.ErrInvalidState {
		t.Errorf("Refund after release: got %v, want ErrInvalidState", err)
	}

	var reread escrow.Hold
	if err := db.Where("id = ?", h.ID).First(&reread).Error; err != nil {
		t.Fatalf("reread hold: %v", err)
	}
	if reread.State != "released" {
		t.Errorf("expected state to remain released, got %s (refund incorrectly applied)", reread.State)
	}
}

// TestGetByReference_OnlyReturnsHeldHolds checks that a released hold no
// longer shows up as the "active" hold for its reference — otherwise a
// caller polling by booking ID could act on a stale, already-settled hold.
func TestGetByReference_OnlyReturnsHeldHolds(t *testing.T) {
	db := testDB(t)
	from, to, ref := uuid.New(), uuid.New(), uuid.New()

	h, err := escrow.NewHold(db, from, to, 25_00, "test_hold", &ref, nil)
	if err != nil {
		t.Fatalf("NewHold: %v", err)
	}

	found, err := escrow.GetByReference(db, ref)
	if err != nil {
		t.Fatalf("GetByReference while held: %v", err)
	}
	if found.ID != h.ID {
		t.Errorf("GetByReference returned wrong hold: %s, want %s", found.ID, h.ID)
	}

	if err := escrow.Release(db, h.ID); err != nil {
		t.Fatalf("Release: %v", err)
	}
	if _, err := escrow.GetByReference(db, ref); err != escrow.ErrNotFound {
		t.Errorf("GetByReference after release: got %v, want ErrNotFound", err)
	}
}
