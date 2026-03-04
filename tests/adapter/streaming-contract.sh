#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'jobs -p | xargs -r kill >/dev/null 2>&1 || true; rm -rf "$TMP_DIR"' EXIT

UP_PORT=$((39000 + RANDOM % 1000))
AD_PORT=$((40000 + RANDOM % 1000))
LOG_FILE="$TMP_DIR/upstream.jsonl"
BODY_FILE="$TMP_DIR/body.txt"

MOCK_UPSTREAM_PORT="$UP_PORT" \
MOCK_UPSTREAM_MODE="stream-text" \
MOCK_UPSTREAM_LOG_FILE="$LOG_FILE" \
node "$ROOT_DIR/tests/adapter/fixtures/mock-upstream.mjs" >"$TMP_DIR/mock.log" 2>&1 &

SGLANG_UPSTREAM_BASE_URL="http://127.0.0.1:$UP_PORT/v1" \
SGLANG_ADAPTER_HOST="127.0.0.1" \
SGLANG_ADAPTER_PORT="$AD_PORT" \
SGLANG_ADAPTER_STREAM_MODE="proxy" \
SGLANG_ADAPTER_STREAM_FALLBACK="on" \
node "$ROOT_DIR/scripts/sglang-toolcall-adapter.mjs" >"$TMP_DIR/adapter.log" 2>&1 &

sleep 0.3

REQ='{"model":"mock-model","stream":true,"messages":[{"role":"user","content":"contract"}]}'
curl --max-time 8 -sS -N \
  -H 'content-type: application/json' \
  -d "$REQ" \
  "http://127.0.0.1:$AD_PORT/v1/chat/completions" > "$BODY_FILE"

jq -e 'select(.request.stream == true)' "$LOG_FILE" >/dev/null || {
  echo "[streaming-contract] upstream request did not preserve stream=true" >&2
  exit 1
}

if ! grep -q '^data:' "$BODY_FILE"; then
  echo "[streaming-contract] expected SSE data output" >&2
  exit 1
fi

echo "[streaming-contract] passed"
