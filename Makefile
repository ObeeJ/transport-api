.PHONY: services services-down dev build test tidy migrate web backup smoke

# Bring up postgres + redis
services:
	docker compose up -d

services-down:
	docker compose down

# Run the API (auto-migrates on boot in dev)
dev:
	go run ./cmd/api

build:
	go build -o bin/api ./cmd/api

test:
	go test ./...

tidy:
	go mod tidy

# Standalone migration runner (no-op for now; auto-migrate runs on boot).
migrate:
	@echo "Auto-migrate runs on API boot. Standalone runner will land when we switch to goose."

# Promote a user to steward. Usage: make seed-steward EMAIL=foo@bar
seed-steward:
	@if [ -z "$(EMAIL)" ]; then echo "Usage: make seed-steward EMAIL=foo@bar"; exit 1; fi
	docker exec akin-postgres psql -U akin -d akin -c "UPDATE users SET role='steward' WHERE email='$(EMAIL)';"

# Demote back to member.
seed-unsteward:
	@if [ -z "$(EMAIL)" ]; then echo "Usage: make seed-unsteward EMAIL=foo@bar"; exit 1; fi
	docker exec akin-postgres psql -U akin -d akin -c "UPDATE users SET role='member' WHERE email='$(EMAIL)';"

# Run the frontend
web:
	pnpm --dir web/app dev

smoke:
	./scripts/smoke.sh

# Database backup to timestamped file
backup:
	./scripts/backup.sh
