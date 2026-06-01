#!/usr/bin/env bash
# Ежедневный дамп БД CaseMoney.
#
# Использует $DATABASE_URL (тот же, что и приложение). Делает сжатый
# pg_dump в каталог $BACKUP_DIR и удаляет дампы старше $KEEP_DAYS дней.
#
# Пример запуска:
#   DATABASE_URL=postgresql://user:pass@host:5432/casemoney \
#   BACKUP_DIR=/var/backups/casemoney KEEP_DAYS=14 ./backup_db.sh
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL не задан}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT="$BACKUP_DIR/casemoney_${STAMP}.sql.gz"

echo "[backup] dumping to $OUT"
# -Fc был бы кастомным форматом; берём plain SQL + gzip для простоты восстановления.
pg_dump "$DATABASE_URL" --no-owner --no-privileges | gzip -9 > "$OUT"

echo "[backup] removing dumps older than ${KEEP_DAYS} days"
find "$BACKUP_DIR" -name 'casemoney_*.sql.gz' -mtime "+${KEEP_DAYS}" -delete || true

echo "[backup] done: $(ls -lh "$OUT" | awk '{print $5}')"
