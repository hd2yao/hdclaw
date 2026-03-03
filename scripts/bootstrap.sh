#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 1
  fi
}

echo "[bootstrap] checking dependencies"
need_cmd openclaw
need_cmd jq
need_cmd ruby

mkdir -p scripts config/profiles skills/custom skills/vendor tests/config tests/skills docs

if [[ ! -f .env.local ]]; then
  echo "[bootstrap] .env.local not found. Create from .env.example before running make sync"
fi

echo "[bootstrap] done"
