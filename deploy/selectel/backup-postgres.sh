#!/usr/bin/env bash
set -euo pipefail
umask 077

BACKUP_ROOT="${BACKUP_ROOT:-/srv/solo32/backups/postgres}"
KEEP_DAYS="${KEEP_DAYS:-14}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-solo32-database-1}"
POSTGRES_ADMIN="${POSTGRES_ADMIN:-casemoney}"
DATABASES="${DATABASES:-casemoney toppulse}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$BACKUP_ROOT"

for database in $DATABASES; do
  database_dir="$BACKUP_ROOT/$database"
  mkdir -p "$database_dir"
  temporary="$database_dir/.${database}_${STAMP}.dump.tmp"
  output="$database_dir/${database}_${STAMP}.dump"

  docker exec "$POSTGRES_CONTAINER" pg_dump \
    -U "$POSTGRES_ADMIN" \
    -d "$database" \
    -Fc \
    --no-owner \
    --no-privileges > "$temporary"

  test -s "$temporary"
  mv "$temporary" "$output"
  sha256sum "$output" > "${output}.sha256"

  find "$database_dir" -type f \
    \( -name "${database}_*.dump" -o -name "${database}_*.dump.sha256" \) \
    -mtime "+$KEEP_DAYS" -delete
done
