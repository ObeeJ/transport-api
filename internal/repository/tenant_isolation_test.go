package repository_test

import (
	"os"
	"testing"

	akindb "github.com/obeej/akin/internal/db"
	"github.com/obeej/akin/internal/models"
	"github.com/obeej/akin/internal/repository"
	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func openTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set — skipping live-Postgres test")
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Skipf("postgres unavailable: %v", err)
	}
	if err := akindb.AutoMigrate(db); err != nil {
		t.Fatalf("auto-migrate: %v", err)
	}
	return db
}

// TestTenantIsolation_Recipients asserts that ListApproved and ListPending
// never return rows belonging to a different institution.
func TestTenantIsolation_Recipients(t *testing.T) {
	db := openTestDB(t)
	repo := repository.NewRecipientRepo(db)

	instA := models.Institution{Name: "Tenant A " + t.Name(), Slug: "tenant-a-" + uuid.New().String()}
	instB := models.Institution{Name: "Tenant B " + t.Name(), Slug: "tenant-b-" + uuid.New().String()}
	if err := db.Create(&instA).Error; err != nil {
		t.Fatalf("create instA: %v", err)
	}
	if err := db.Create(&instB).Error; err != nil {
		t.Fatalf("create instB: %v", err)
	}

	recA := models.Recipient{
		InstitutionID:  instA.ID,
		UserID:         uuid.New(),
		PseudonymousID: "R-A-" + uuid.New().String(),
		Status:         "approved",
	}
	recB := models.Recipient{
		InstitutionID:  instB.ID,
		UserID:         uuid.New(),
		PseudonymousID: "R-B-" + uuid.New().String(),
		Status:         "pending",
	}
	if err := db.Create(&recA).Error; err != nil {
		t.Fatalf("create recA: %v", err)
	}
	if err := db.Create(&recB).Error; err != nil {
		t.Fatalf("create recB: %v", err)
	}

	t.Cleanup(func() {
		db.Unscoped().Delete(&recA)
		db.Unscoped().Delete(&recB)
		db.Unscoped().Delete(&instA)
		db.Unscoped().Delete(&instB)
	})

	// ListApproved(instA) must contain A's recipient and never B's.
	approved, err := repo.ListApproved(instA.ID)
	if err != nil {
		t.Fatalf("ListApproved: %v", err)
	}
	foundA := false
	for _, r := range approved {
		if r.ID == recB.ID {
			t.Errorf("ListApproved(instA) leaked instB recipient %s", recB.ID)
		}
		if r.ID == recA.ID {
			foundA = true
		}
	}
	if !foundA {
		t.Errorf("ListApproved(instA) did not return instA recipient %s", recA.ID)
	}

	// ListPending(instB) must not return A's recipient.
	pending, err := repo.ListPending(instB.ID)
	if err != nil {
		t.Fatalf("ListPending: %v", err)
	}
	for _, r := range pending {
		if r.ID == recA.ID {
			t.Errorf("ListPending(instB) leaked instA recipient %s", recA.ID)
		}
	}
}
