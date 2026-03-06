#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'jobs -p | xargs -r kill >/dev/null 2>&1 || true; rm -rf "$TMP_DIR"' EXIT

UP_PORT=$((39000 + RANDOM % 1000))
AD_PORT=$((40000 + RANDOM % 1000))
BODY_FILE="$TMP_DIR/body.txt"

MOCK_UPSTREAM_PORT="$UP_PORT" \
MOCK_UPSTREAM_MODE="stream-text" \
node "$ROOT_DIR/tests/adapter/fixtures/mock-upstream.mjs" >"$TMP_DIR/mock.log" 2>&1 &

SGLANG_UPSTREAM_BASE_URL="http://127.0.0.1:$UP_PORT/v1" \
SGLANG_ADAPTER_HOST="127.0.0.1" \
SGLANG_ADAPTER_PORT="$AD_PORT" \
SGLANG_ADAPTER_STREAM_MODE="proxy" \
SGLANG_ADAPTER_STREAM_FALLBACK="on" \
node "$ROOT_DIR/scripts/sglang-toolcall-adapter.mjs" >"$TMP_DIR/adapter.log" 2>&1 &

sleep 0.3

REQ='{"model":"mock-model","stream":true,"messages":[{"role":"user","content":"intro-guard"}]}'
curl --max-time 8 -sS -N \
  -H 'content-type: application/json' \
  -d "$REQ" \
  "http://127.0.0.1:$AD_PORT/v1/chat/completions" > "$BODY_FILE"

content_lines="$(
  rg '^data: \{' "$BODY_FILE" \
    | sed 's/^data: //' \
    | jq -r '.choices[0].delta.content // empty'
)"

content_chunks="$(printf '%s\n' "$content_lines" | rg -v '^$' | wc -l | tr -d ' ')"
if [[ "$content_chunks" -lt 2 ]]; then
  echo "[streaming-intro-guard] expected incremental content chunks, got $content_chunks" >&2
  exit 1
fi

if ! printf '%s\n' "$content_lines" | rg -q '^hello$'; then
  echo "[streaming-intro-guard] missing first content chunk" >&2
  exit 1
fi

if ! printf '%s\n' "$content_lines" | rg -q '^world$'; then
  echo "[streaming-intro-guard] missing second content chunk" >&2
  exit 1
fi

echo "[streaming-intro-guard] passed"
