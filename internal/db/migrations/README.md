# Migrations

These are [goose](https://github.com/pressly/goose) SQL migrations.

## During the transition

`AutoMigrate` is still wired in `internal/db/migrate.go` and runs on boot. It owns the schema for now. Goose is set up alongside it so new schema changes can land as explicit SQL, with `AutoMigrate` becoming a no-op once every table is also represented in a numbered migration here.

## Writing a new migration

```bash
go run github.com/pressly/goose/v3/cmd/goose@latest -dir internal/db/migrations create add_something sql
```

Or by hand: `NNNNN_<short_name>.sql` with `-- +goose Up` and `-- +goose Down` sections.

## Running

Goose runs automatically at boot via `db.RunGooseUp` (logs are tagged `goose`). To run from the CLI:

```bash
go run github.com/pressly/goose/v3/cmd/goose@latest \
  -dir internal/db/migrations postgres "$DATABASE_URL" up
```
