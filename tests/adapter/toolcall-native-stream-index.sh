#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'jobs -p | xargs -r kill >/dev/null 2>&1 || true; rm -rf "$TMP_DIR"' EXIT

UP_PORT=$((39000 + RANDOM % 1000))
AD_PORT=$((40000 + RANDOM % 1000))
BODY_FILE="$TMP_DIR/body.txt"

MOCK_UPSTREAM_PORT="$UP_PORT" \
MOCK_UPSTREAM_MODE="stream-native-toolcall-fragments" \
node "$ROOT_DIR/tests/adapter/fixtures/mock-upstream.mjs" >"$TMP_DIR/mock.log" 2>&1 &

SGLANG_UPSTREAM_BASE_URL="http://127.0.0.1:$UP_PORT/v1" \
SGLANG_ADAPTER_HOST="127.0.0.1" \
SGLANG_ADAPTER_PORT="$AD_PORT" \
SGLANG_ADAPTER_STREAM_MODE="proxy" \
SGLANG_ADAPTER_STREAM_FALLBACK="on" \
node "$ROOT_DIR/scripts/sglang-toolcall-adapter.mjs" >"$TMP_DIR/adapter.log" 2>&1 &

sleep 0.3

REQ='{"model":"mock-model","stream":true,"messages":[{"role":"user","content":"native-toolcall"}]}'
curl --max-time 8 -sS -N \
  -H 'content-type: application/json' \
  -d "$REQ" \
  "http://127.0.0.1:$AD_PORT/v1/chat/completions" > "$BODY_FILE"

tool_calls_json="$(
  rg '^data: \{' "$BODY_FILE" \
    | sed 's/^data: //' \
    | jq -c 'select(.choices[0].delta.tool_calls != null) | .choices[0].delta.tool_calls[0]'
)"

if ! printf '%s\n' "$tool_calls_json" | jq -e 'select(.index == 0 and .id == "call_native_1")' >/dev/null; then
  echo "[toolcall-native-stream-index] expected first tool_call chunk to keep upstream id/index" >&2
  exit 1
fi

if ! printf '%s\n' "$tool_calls_json" | jq -e 'select(.index == 0 and .id == "call_native_1" and .type == "function" and .function.name == "get_weather" and .function.arguments == "{\"city\":\"Beijing\"}")' >/dev/null; then
  echo "[toolcall-native-stream-index] expected merged tool_call arguments by upstream index" >&2
  exit 1
fi

if printf '%s\n' "$tool_calls_json" | jq -e 'select(.index == 1)' >/dev/null; then
  echo "[toolcall-native-stream-index] unexpected synthetic index detected" >&2
  exit 1
fi

echo "[toolcall-native-stream-index] passed"
