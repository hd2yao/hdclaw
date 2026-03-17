#!/bin/sh
set -eu

DB_PATH="${DASHBOARD_DB_PATH:-/data/dashboard.db}"
DB_PATH="${DB_PATH#/app}"
BACKUP_DIR="${BACKUP_DIR:-/backup}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BASENAME="$(basename "$DB_PATH")"
TARGET="${BACKUP_DIR}/${BASENAME}.${STAMP}.sqlite3"
TMP_TARGET="${TARGET}.tmp"

mkdir -p "$BACKUP_DIR"

if [ ! -f "$DB_PATH" ]; then
  echo "skip backup: database file not found at $DB_PATH" >&2
  exit 1
fi

cp "$DB_PATH" "$TMP_TARGET"
if command -v gzip >/dev/null 2>&1; then
  gzip -f "$TMP_TARGET"
  FINAL_TARGET="${TMP_TARGET}.gz"
  mv "$FINAL_TARGET" "${TARGET}.gz"
else
  mv "$TMP_TARGET" "$TARGET"
fi

find "$BACKUP_DIR" -type f -name '*.sqlite3' -mtime +"$RETENTION_DAYS" -delete || true
find "$BACKUP_DIR" -type f -name '*.sqlite3.gz' -mtime +"$RETENTION_DAYS" -delete || true

echo "backup completed: $TARGET"
