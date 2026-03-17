#!/bin/sh
set -eu

DB_PATH="${DASHBOARD_DB_PATH:-/data/dashboard.db}"
DB_PATH="${DB_PATH#/app}"
[ -n "$DB_PATH" ] || exit 1

if [ ! -f "$DB_PATH" ]; then
  echo "database file not found: $DB_PATH" >&2
  exit 1
fi

if [ ! -s "$DB_PATH" ]; then
  echo "database file is empty: $DB_PATH" >&2
  exit 1
fi

sqlite3 "$DB_PATH" 'PRAGMA quick_check;' | grep -q '^ok$'
