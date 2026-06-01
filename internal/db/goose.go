package db

import (
	"embed"
	"fmt"
	"log/slog"

	"github.com/pressly/goose/v3"
	"gorm.io/gorm"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// RunGooseUp applies any pending goose migrations.
// During the AutoMigrate→goose transition this is a no-op for an empty
// migrations dir or a clean schema; once we move table definitions out of
// AutoMigrate, this is the authoritative path.
func RunGooseUp(gdb *gorm.DB) error {
	goose.SetBaseFS(migrationsFS)
	if err := goose.SetDialect("postgres"); err != nil {
		return fmt.Errorf("goose dialect: %w", err)
	}
	sqlDB, err := gdb.DB()
	if err != nil {
		return fmt.Errorf("get sql.DB: %w", err)
	}
	before, _ := goose.GetDBVersion(sqlDB)
	if err := goose.Up(sqlDB, "migrations"); err != nil {
		return fmt.Errorf("goose up: %w", err)
	}
	after, _ := goose.GetDBVersion(sqlDB)
	if after != before {
		slog.Info("goose migrations applied", "from", before, "to", after)
	} else {
		slog.Info("goose: no pending migrations", "version", after)
	}
	return nil
}
