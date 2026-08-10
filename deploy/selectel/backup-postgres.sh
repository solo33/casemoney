#!/usr/bin/env bash
set -euo pipefail
umask 077

BACKUP_ROOT="${BACKUP_ROOT:-/srv/solo32/backups/postgres}"
KEEP_BACKUPS="${KEEP_BACKUPS:-7}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-solo32-database-1}"
POSTGRES_ADMIN="${POSTGRES_ADMIN:-casemoney}"
DATABASES="${DATABASES:-casemoney toppulse smetafact}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
temporary=""

cleanup_temporary() {
  if [[ -n "$temporary" ]]; then
    rm -f "$temporary"
  fi
}

trap cleanup_temporary EXIT

if ! [[ "$KEEP_BACKUPS" =~ ^[1-9][0-9]*$ ]]; then
  echo "KEEP_BACKUPS must be a positive integer" >&2
  exit 2
fi

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
  docker exec -i "$POSTGRES_CONTAINER" pg_restore --list < "$temporary" > /dev/null
  mv "$temporary" "$output"
  temporary=""
  sha256sum "$output" > "${output}.sha256"

  mapfile -t obsolete_backups < <(
    find "$database_dir" -maxdepth 1 -type f -name "${database}_*.dump" -printf '%f\n' \
      | sort -r \
      | tail -n "+$((KEEP_BACKUPS + 1))"
  )

  for obsolete in "${obsolete_backups[@]}"; do
    rm -f "$database_dir/$obsolete" "$database_dir/$obsolete.sha256"
  done
done
