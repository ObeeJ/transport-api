package db

import (
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"strings"

	"github.com/obeej/akin/internal/models"
	"gorm.io/gorm"
)

func AutoMigrate(gdb *gorm.DB) error {
	if err := gdb.Exec(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`).Error; err != nil {
		return fmt.Errorf("ensure uuid-ossp: %w", err)
	}
	if err := gdb.AutoMigrate(
		&models.Institution{},
		&models.User{},
		&models.Session{},
		&models.GiverDeposit{},
		&models.Recipient{},
		&models.RecipientBankAccount{},
		&models.Payout{},
		&models.StewardAction{},
		&models.Hub{},
		&models.Trip{},
		&models.Booking{},
		&models.Attendance{},
		&models.WebhookEvent{},
		&models.AuditEntry{},
		&models.Notification{},
		&models.Wallet{},
		&models.WalletTransaction{},
		&models.TripAttendance{},
		&models.DriverProfile{},
		&models.RosterEntry{},
		&models.TripRating{},
		&models.DriverImpact{},
		&models.EncouragementNote{},
		&models.SOSAlert{},
		&models.TripGPSPoint{},
		&models.RecipientAppeal{},
		&models.Strike{},
	); err != nil {
		return fmt.Errorf("auto-migrate: %w", err)
	}
	// Unique active booking per (trip, rider). A rider can re-book if they cancelled.
	if err := gdb.Exec(`
		CREATE UNIQUE INDEX IF NOT EXISTS bookings_unique_active
		ON bookings (trip_id, rider_id)
		WHERE status = 'booked'
	`).Error; err != nil {
		return fmt.Errorf("create bookings_unique_active: %w", err)
	}
	if err := seedInstitution(gdb); err != nil {
		return fmt.Errorf("seed institution: %w", err)
	}
	if err := seedHubs(gdb); err != nil {
		return fmt.Errorf("seed hubs: %w", err)
	}
	slog.Info("schema migrated")
	return nil
}

func seedInstitution(gdb *gorm.DB) error {
	var existing models.Institution
	if err := gdb.Where("slug = ?", models.DefaultInstitutionSlug).First(&existing).Error; err == nil {
		return nil
	}
	// Use the canonical fixed ID (not a random one) so this AutoMigrate seed
	// agrees with goose migration 00002, which backfills all existing rows to
	// exactly this id. A random id here would silently orphan every row from
	// its institution once query scoping is enforced.
	return gdb.Create(&models.Institution{
		ID:     models.DefaultInstitutionID,
		Name:   "Default Institution",
		Slug:   models.DefaultInstitutionSlug,
		Active: true,
	}).Error
}

// seedHubs — idempotent seed of pickup hubs from SEED_HUBS env var.
// Format: "Name|lat|lng,Name|lat|lng" — e.g.
//   SEED_HUBS="Main Gate|6.4474|3.4525,Library|6.4500|3.4530"
// Falls back to an empty seed (no hubs) when the var is not set, so
// stewards can add hubs via the admin UI instead.
func seedHubs(gdb *gorm.DB) error {
	raw := os.Getenv("SEED_HUBS")
	if raw == "" {
		return nil
	}
	for _, entry := range strings.Split(raw, ",") {
		parts := strings.SplitN(strings.TrimSpace(entry), "|", 3)
		if len(parts) != 3 {
			slog.Warn("seedHubs: skipping malformed entry", "entry", entry)
			continue
		}
		lat, errLat := strconv.ParseFloat(strings.TrimSpace(parts[1]), 64)
		lng, errLng := strconv.ParseFloat(strings.TrimSpace(parts[2]), 64)
		if errLat != nil || errLng != nil {
			slog.Warn("seedHubs: skipping entry with invalid coords", "entry", entry)
			continue
		}
		name := strings.TrimSpace(parts[0])
		var existing models.Hub
		if err := gdb.Where("name = ?", name).First(&existing).Error; err == nil {
			continue // already seeded
		}
		if err := gdb.Create(&models.Hub{Name: name, Lat: lat, Lng: lng, Active: true}).Error; err != nil {
			return err
		}
	}
	return nil
}
