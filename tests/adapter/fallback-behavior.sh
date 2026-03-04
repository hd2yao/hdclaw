#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'stop_stack; rm -rf "$TMP_DIR"' EXIT

UP_PORT=$((39000 + RANDOM % 1000))
AD_PORT=$((40000 + RANDOM % 1000))
MOCK_PID=""
ADAPTER_PID=""

stop_stack() {
  if [[ -n "$ADAPTER_PID" ]] && kill -0 "$ADAPTER_PID" >/dev/null 2>&1; then
    kill "$ADAPTER_PID" >/dev/null 2>&1 || true
    wait "$ADAPTER_PID" 2>/dev/null || true
  fi
  if [[ -n "$MOCK_PID" ]] && kill -0 "$MOCK_PID" >/dev/null 2>&1; then
    kill "$MOCK_PID" >/dev/null 2>&1 || true
    wait "$MOCK_PID" 2>/dev/null || true
  fi
  ADAPTER_PID=""
  MOCK_PID=""
}

start_stack() {
  local mode="$1"
  stop_stack

  MOCK_UPSTREAM_PORT="$UP_PORT" \
  MOCK_UPSTREAM_MODE="$mode" \
  node "$ROOT_DIR/tests/adapter/fixtures/mock-upstream.mjs" >"$TMP_DIR/mock-$mode.log" 2>&1 &
  MOCK_PID=$!

  SGLANG_UPSTREAM_BASE_URL="http://127.0.0.1:$UP_PORT/v1" \
  SGLANG_ADAPTER_HOST="127.0.0.1" \
  SGLANG_ADAPTER_PORT="$AD_PORT" \
  SGLANG_ADAPTER_STREAM_MODE="proxy" \
  SGLANG_ADAPTER_STREAM_FALLBACK="on" \
  node "$ROOT_DIR/scripts/sglang-toolcall-adapter.mjs" >"$TMP_DIR/adapter-$mode.log" 2>&1 &
  ADAPTER_PID=$!

  sleep 0.4
}

REQ='{"model":"mock-model","stream":true,"messages":[{"role":"user","content":"fallback"}]}'

# Phase 1: pre-first-chunk failure should fallback to legacy streaming response.
start_stack "stream-fail-pre-first"
HDR1="$TMP_DIR/h1.txt"
BODY1="$TMP_DIR/b1.txt"
curl --max-time 8 -sS -N -D "$HDR1" \
  -H 'content-type: application/json' \
  -d "$REQ" \
  "http://127.0.0.1:$AD_PORT/v1/chat/completions" > "$BODY1"

if ! grep -qi '^x-openclaw-adapter-stream-mode: fallback' "$HDR1"; then
  echo "[fallback-behavior] expected fallback mode for pre-first failure" >&2
  exit 1
fi

if ! grep -q 'fallback-ok' "$BODY1"; then
  echo "[fallback-behavior] expected fallback content for pre-first failure" >&2
  exit 1
fi

# Phase 2: post-first-chunk failure should not fallback.
start_stack "stream-fail-after-first"
HDR2="$TMP_DIR/h2.txt"
BODY2="$TMP_DIR/b2.txt"
curl --max-time 8 -sS -N -D "$HDR2" \
  -H 'content-type: application/json' \
  -d "$REQ" \
  "http://127.0.0.1:$AD_PORT/v1/chat/completions" > "$BODY2"

if ! grep -qi '^x-openclaw-adapter-stream-mode: proxy' "$HDR2"; then
  echo "[fallback-behavior] expected proxy mode for post-first failure" >&2
  exit 1
fi

if grep -q 'fallback-ok' "$BODY2"; then
  echo "[fallback-behavior] post-first failure unexpectedly used fallback" >&2
  exit 1
fi

if ! grep -q '^data: \[DONE\]' "$BODY2"; then
  echo "[fallback-behavior] expected DONE marker on post-first failure path" >&2
  exit 1
fi

echo "[fallback-behavior] passed"
