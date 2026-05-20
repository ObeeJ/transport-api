package db

import (
	"fmt"
	"log/slog"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func Open(dsn string, env string) (*gorm.DB, error) {
	logLevel := logger.Warn
	if env == "development" {
		logLevel = logger.Info
	}

	var gormDB *gorm.DB
	var err error

	for attempt := 1; attempt <= 10; attempt++ {
		gormDB, err = gorm.Open(postgres.Open(dsn), &gorm.Config{
			Logger:      logger.Default.LogMode(logLevel),
			PrepareStmt: true,
		})
		if err == nil {
			sqlDB, dbErr := gormDB.DB()
			if dbErr == nil {
				if pingErr := sqlDB.Ping(); pingErr == nil {
					sqlDB.SetMaxOpenConns(25)
					sqlDB.SetMaxIdleConns(5)
					sqlDB.SetConnMaxLifetime(30 * time.Minute)
					slog.Info("postgres connected", "attempt", attempt)
					return gormDB, nil
				} else {
					err = pingErr
				}
			} else {
				err = dbErr
			}
		}
		slog.Warn("postgres not ready, retrying...", "attempt", attempt, "err", err)
		time.Sleep(time.Duration(attempt) * time.Second)
	}

	return nil, fmt.Errorf("postgres connect failed after 10 attempts: %w", err)
}
