package pricing_test

import (
	"os"
	"sync"
	"testing"
	"time"

	akindb "github.com/obeej/akin/internal/db"
	"github.com/obeej/akin/internal/pricing"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var (
	migrateOnce sync.Once
	migrateErr  error
)

// testDB connects to the same dev Postgres the other real-DB tests use
// (docker-compose's akin-postgres on 55432) and applies both the AutoMigrate
// set and the goose migrations that create pricing_settings/vehicle_types.
// Skips cleanly if no DB is reachable — this is an integration test, not a
// unit test, per the master plan's "no mocks in E2E tests" rule.
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

// TestCalculate_GoldenFare_Keke pins the fare formula against the seeded
// default settings (fuel ₦900/L, 30% driver margin, 3% platform fee clamped
// to ₦10–150) and the keke vehicle type (35 km/L) at an off-peak hour so
// surge never perturbs the result. If this test starts failing, either the
// seed data changed or the formula in engine.go did — both are worth knowing
// about before they reach a rider's fare screen.
func TestCalculate_GoldenFare_Keke(t *testing.T) {
	db := testDB(t)
	pricing.InvalidateCache()

	offPeak := time.Date(2026, 1, 1, 3, 0, 0, 0, time.UTC) // 3am — no surge window
	q, err := pricing.Calculate(db, "keke", 35, offPeak)
	if err != nil {
		t.Fatalf("Calculate: %v", err)
	}

	if q.SurgeMultiplier != 1.0 {
		t.Errorf("expected no surge at 3am, got %.2f", q.SurgeMultiplier)
	}
	// litres = 35km / 35 km/L = 1L; fuelCost = 1 * ₦900 = ₦900
	// driverEarns = 900 * 1.30 * surge(1.0) = ₦1,170.00 = 117000 kobo
	wantDriverEarns := int64(117000)
	if q.DriverEarnsKobo != wantDriverEarns {
		t.Errorf("driverEarnsKobo = %d, want %d", q.DriverEarnsKobo, wantDriverEarns)
	}
	// platformFee = 1170 * 0.03 = ₦35.10 = 3510 kobo (within [1000,15000] clamp)
	wantFee := int64(3510)
	if q.PlatformFeeKobo != wantFee {
		t.Errorf("platformFeeKobo = %d, want %d", q.PlatformFeeKobo, wantFee)
	}
	if q.FareKobo != wantDriverEarns+wantFee {
		t.Errorf("fareKobo = %d, want %d", q.FareKobo, wantDriverEarns+wantFee)
	}
}

// TestCalculate_UnknownVehicle_FallsBackToSedan documents the fallback
// behavior in engine.go rather than letting an unrecognized vehicle code
// silently 500 or panic on a missing map entry.
func TestCalculate_UnknownVehicle_FallsBackToSedan(t *testing.T) {
	db := testDB(t)
	pricing.InvalidateCache()

	sedan, err := pricing.Calculate(db, "sedan", 10, time.Date(2026, 1, 1, 3, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("Calculate(sedan): %v", err)
	}
	unknown, err := pricing.Calculate(db, "not_a_real_vehicle", 10, time.Date(2026, 1, 1, 3, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("Calculate(unknown): %v", err)
	}
	if unknown.FareKobo != sedan.FareKobo {
		t.Errorf("unknown vehicle fare %d should fall back to sedan's %d", unknown.FareKobo, sedan.FareKobo)
	}
}

// TestCalculate_SurgeWindows_ApplyMultiplier checks that the morning and
// evening surge windows actually change the fare relative to an off-peak hour.
func TestCalculate_SurgeWindows_ApplyMultiplier(t *testing.T) {
	db := testDB(t)
	pricing.InvalidateCache()

	morning, err := pricing.Calculate(db, "keke", 35, time.Date(2026, 1, 1, 7, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("Calculate(morning): %v", err)
	}
	if morning.SurgeMultiplier <= 1.0 {
		t.Errorf("expected morning surge > 1.0, got %.2f", morning.SurgeMultiplier)
	}

	offPeak, err := pricing.Calculate(db, "keke", 35, time.Date(2026, 1, 1, 3, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("Calculate(offpeak): %v", err)
	}
	if morning.FareKobo <= offPeak.FareKobo {
		t.Errorf("morning fare %d should exceed off-peak fare %d", morning.FareKobo, offPeak.FareKobo)
	}
}
