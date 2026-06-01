package db

import (
	"fmt"
	"log/slog"

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

// seedHubs — idempotent seed of a small starter set of curated pickup points.
// Stewards will be able to edit these once an admin UI lands; for v1 we
// just bootstrap a sensible default for the Lagos area.
func seedHubs(gdb *gorm.DB) error {
	defaults := []models.Hub{
		{Name: "Main Gate", Lat: 6.4474, Lng: 3.4525},
		{Name: "Bode Thomas Bus Stop", Lat: 6.4933, Lng: 3.3686},
		{Name: "Yaba Roundabout", Lat: 6.5095, Lng: 3.3711},
		{Name: "Iyana-Ipaja", Lat: 6.6079, Lng: 3.2880},
	}
	for _, h := range defaults {
		var existing models.Hub
		if err := gdb.Where("name = ?", h.Name).First(&existing).Error; err == nil {
			continue // already seeded
		}
		h.Active = true
		if err := gdb.Create(&h).Error; err != nil {
			return err
		}
	}
	return nil
}
