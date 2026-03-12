#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'jobs -p | xargs -r kill >/dev/null 2>&1 || true; rm -rf "$TMP_DIR"' EXIT

UP_PORT=$((39000 + RANDOM % 1000))
AD_PORT=$((40000 + RANDOM % 1000))
HDR_FILE="$TMP_DIR/headers.txt"
BODY_FILE="$TMP_DIR/body.txt"

MOCK_UPSTREAM_PORT="$UP_PORT" \
MOCK_UPSTREAM_MODE="stream-empty-toolcall-fallback" \
node "$ROOT_DIR/tests/adapter/fixtures/mock-upstream.mjs" >"$TMP_DIR/mock.log" 2>&1 &

SGLANG_UPSTREAM_BASE_URL="http://127.0.0.1:$UP_PORT/v1" \
SGLANG_ADAPTER_HOST="127.0.0.1" \
SGLANG_ADAPTER_PORT="$AD_PORT" \
SGLANG_ADAPTER_STREAM_MODE="proxy" \
SGLANG_ADAPTER_STREAM_FALLBACK="on" \
node "$ROOT_DIR/scripts/sglang-toolcall-adapter.mjs" >"$TMP_DIR/adapter.log" 2>&1 &

sleep 0.3

REQ='{"model":"mock-model","stream":true,"messages":[{"role":"user","content":"latest ai news"}],"tools":[{"type":"function","function":{"name":"web_search","description":"Search the web.","parameters":{"type":"object","properties":{"query":{"type":"string"}},"required":["query"]}}}]}'
curl --max-time 8 -sS -N -D "$HDR_FILE" \
  -H 'content-type: application/json' \
  -d "$REQ" \
  "http://127.0.0.1:$AD_PORT/v1/chat/completions" > "$BODY_FILE"

if ! grep -qi '^x-openclaw-adapter-stream-mode: fallback' "$HDR_FILE"; then
  echo "[stream-empty-toolcall-fallback] expected fallback mode when stream ends without usable tool output" >&2
  exit 1
fi

if ! grep -q '"tool_calls"' "$BODY_FILE"; then
  echo "[stream-empty-toolcall-fallback] expected fallback response to expose tool_calls" >&2
  exit 1
fi

if grep -q '</think>' "$BODY_FILE"; then
  echo "[stream-empty-toolcall-fallback] leaked raw thinking marker to client output" >&2
  exit 1
fi

echo "[stream-empty-toolcall-fallback] passed"
