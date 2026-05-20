#!/usr/bin/env bash
set -euo pipefail

# Backup script — dumps the Akin Postgres database to a timestamped file.
# Usage: ./scripts/backup.sh [output_dir]
#
# Defaults:
#   Container: akin-postgres
#   DB user:   akin
#   DB name:   akin
#   Output:    ./backups/

CONTAINER="${BACKUP_CONTAINER:-akin-postgres}"
DB_USER="${BACKUP_DB_USER:-akin}"
DB_NAME="${BACKUP_DB_NAME:-akin}"
OUT_DIR="${1:-./backups}"

mkdir -p "$OUT_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="akin_${TIMESTAMP}.sql.gz"
FILEPATH="${OUT_DIR}/${FILENAME}"

echo "→ Backing up ${DB_NAME} from ${CONTAINER}..."
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --no-acl | gzip > "$FILEPATH"

SIZE=$(du -h "$FILEPATH" | cut -f1)
echo "✓ Backup complete: ${FILEPATH} (${SIZE})"
