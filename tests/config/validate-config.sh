#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

TARGET="$TMP_DIR/openclaw.json"
BACKUP_DIR="$TMP_DIR/backup"
ENV_BAD="$TMP_DIR/.env.bad"
ENV_OK="$TMP_DIR/.env.ok"

cat > "$ENV_BAD" <<'EOB'
CLAWRA_IMAGE_PROVIDER=fal
CLAWRA_IMAGE_MODEL=gpt-image-1
EOB

cat > "$ENV_OK" <<'EOG'
CLAWRA_IMAGE_PROVIDER=fal
CLAWRA_IMAGE_MODEL=gpt-image-1
OPENAI_API_KEY=test-openai-key
FAL_KEY=test-fal-key
EOG

echo "[test-config] case1: missing env should fail"
if OPENCLAW_ENV_FILE="$ENV_BAD" OPENCLAW_CONFIG_TARGET="$TARGET" OPENCLAW_BACKUP_DIR="$BACKUP_DIR" \
  bash "$ROOT_DIR/scripts/sync-config.sh" >/dev/null 2>&1; then
  echo "[test-config] expected failure but got success" >&2
  exit 1
fi

echo "[test-config] case2: full env should pass"
OPENCLAW_ENV_FILE="$ENV_OK" OPENCLAW_CONFIG_TARGET="$TARGET" OPENCLAW_BACKUP_DIR="$BACKUP_DIR" \
  bash "$ROOT_DIR/scripts/sync-config.sh" >/dev/null

[[ -f "$TARGET" ]] || { echo "[test-config] target not created" >&2; exit 1; }

sum1="$(shasum "$TARGET" | awk '{print $1}')"
OPENCLAW_ENV_FILE="$ENV_OK" OPENCLAW_CONFIG_TARGET="$TARGET" OPENCLAW_BACKUP_DIR="$BACKUP_DIR" \
  bash "$ROOT_DIR/scripts/sync-config.sh" >/dev/null
sum2="$(shasum "$TARGET" | awk '{print $1}')"

if [[ "$sum1" != "$sum2" ]]; then
  echo "[test-config] config is not idempotent" >&2
  exit 1
fi

echo "[test-config] passed"
