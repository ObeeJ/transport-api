-- +goose Up
-- Baseline marker. The actual schema is created/maintained by GORM's
-- AutoMigrate during the transition. From migration 00002 onward,
-- changes are explicit SQL — see internal/db/migrations/README.md.
SELECT 1;

-- +goose Down
SELECT 1;
