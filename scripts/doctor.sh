#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${OPENCLAW_ENV_FILE:-$ROOT_DIR/.env.local}"
TARGET_CONFIG="${OPENCLAW_CONFIG_TARGET:-$HOME/.openclaw/openclaw.json}"
CATALOG_PATH="${CATALOG_PATH:-$ROOT_DIR/skills/catalog.yaml}"

check_cmd() {
  if command -v "$1" >/dev/null 2>&1; then
    echo "[doctor] ok: $1"
  else
    echo "[doctor] missing: $1" >&2
  fi
}

check_cmd openclaw
check_cmd jq
check_cmd ruby

if [[ -f "$ENV_FILE" ]]; then
  echo "[doctor] env file found: $ENV_FILE"
else
  echo "[doctor] env file missing: $ENV_FILE" >&2
fi

if [[ -f "$TARGET_CONFIG" ]]; then
  echo "[doctor] config found: $TARGET_CONFIG"
else
  echo "[doctor] config missing: $TARGET_CONFIG" >&2
fi

if [[ -d "$HOME/.openclaw/credentials" ]]; then
  mode="$(stat -f %Mp%Lp "$HOME/.openclaw/credentials" 2>/dev/null || true)"
  echo "[doctor] credentials dir mode: ${mode:-unknown}"
fi

if [[ -f "$CATALOG_PATH" ]]; then
  echo "[doctor] enabled skills:"
  ruby -ryaml -e '
    c = YAML.load_file(ARGV[0]) || {}
    (c["skills"] || []).each { |s| puts "  - #{s["name"]}" if s["enabled"] }
  ' "$CATALOG_PATH"
fi

echo "[doctor] done"
