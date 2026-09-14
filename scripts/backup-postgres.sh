#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="${BACKUP_DIR:-$ROOT/backups}"
mkdir -p "$OUT_DIR"
FILE="$OUT_DIR/friends-$STAMP.sql.gz"

docker compose exec -T postgres pg_dump -U "${POSTGRES_USER:-friends}" "${POSTGRES_DB:-friends}" | gzip > "$FILE"
echo "Wrote $FILE"

# Restore (stop app first):
# gunzip -c backups/friends-YYYYMMDD-HHMMSS.sql.gz | docker compose exec -T postgres psql -U friends friends
