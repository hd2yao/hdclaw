#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

SKILL_DIR="$ROOT_DIR/skills/custom/clawra-selfie"
WRAPPER_PATH="$SKILL_DIR/scripts/clawra-selfie.sh"

echo "[test-clawra-selfie] expecting wrapper at $WRAPPER_PATH"
[[ -x "$WRAPPER_PATH" ]] || {
  echo "[test-clawra-selfie] missing executable wrapper: $WRAPPER_PATH" >&2
  exit 1
}

pushd "$TMP_DIR" >/dev/null
set +e
OUTPUT="$(
  CLAWRA_IMAGE_PROVIDER=openai \
  OPENCLAW_CONFIG_PATH="$TMP_DIR/missing-openclaw.json" \
  bash "$WRAPPER_PATH" "test prompt" "telegram" "123456789" 2>&1
)"
STATUS=$?
set -e
popd >/dev/null

if [[ "$STATUS" -eq 0 ]]; then
  echo "[test-clawra-selfie] expected wrapper to fail without provider credentials" >&2
  exit 1
fi

grep -q "openai provider not configured" <<<"$OUTPUT" || {
  echo "[test-clawra-selfie] expected provider configuration error, got:" >&2
  echo "$OUTPUT" >&2
  exit 1
}

if grep -q "No such file or directory" <<<"$OUTPUT"; then
  echo "[test-clawra-selfie] wrapper still depends on caller cwd" >&2
  echo "$OUTPUT" >&2
  exit 1
fi

echo "[test-clawra-selfie] passed"
