#!/usr/bin/env bash
set -euo pipefail

OPENCLAW_HOME="${OPENCLAW_HOME:-$HOME/.openclaw}"
OPENCLAW_CONFIG="${OPENCLAW_CONFIG_PATH:-$OPENCLAW_HOME/openclaw.json}"
DASHBOARD_PORT="${OPENCLAW_DASHBOARD_PORT:-18790}"
CHANNEL_PLUGINS_RAW="${OPENCLAW_DOCKER_CHANNEL_PLUGINS:-telegram,whatsapp}"
TELEGRAM_AUTO_SELECT_FAMILY="${OPENCLAW_DOCKER_TELEGRAM_AUTO_SELECT_FAMILY:-}"
TELEGRAM_DNS_RESULT_ORDER="${OPENCLAW_DOCKER_TELEGRAM_DNS_RESULT_ORDER:-}"
LOCAL_BASE_URL="${OPENCLAW_LOCAL_BASE_URL:-http://192.168.6.230:30000/v1}"
LOCAL_TOOLCALL_ADAPTER="${OPENCLAW_LOCAL_TOOLCALL_ADAPTER:-off}"
LOCAL_TOOLCALL_ADAPTER_BASE_URL="${OPENCLAW_LOCAL_TOOLCALL_ADAPTER_BASE_URL:-http://127.0.0.1:31001/v1}"
SGLANG_UPSTREAM_BASE_URL="${SGLANG_UPSTREAM_BASE_URL:-$LOCAL_BASE_URL}"
SGLANG_ADAPTER_HOST="${SGLANG_ADAPTER_HOST:-127.0.0.1}"
SGLANG_ADAPTER_PORT="${SGLANG_ADAPTER_PORT:-31001}"
SGLANG_ADAPTER_STREAM_MODE="${SGLANG_ADAPTER_STREAM_MODE:-proxy}"
SGLANG_ADAPTER_STREAM_FALLBACK="${SGLANG_ADAPTER_STREAM_FALLBACK:-on}"
SGLANG_ADAPTER_SCRIPT="${SGLANG_ADAPTER_SCRIPT:-/usr/local/lib/openclaw/sglang-toolcall-adapter.mjs}"
SGLANG_ADAPTER_LOG="${SGLANG_ADAPTER_LOG:-$OPENCLAW_HOME/sglang-adapter.log}"

if ! command -v openclaw >/dev/null 2>&1; then
  echo "[docker-init] missing required command: openclaw" >&2
  exit 1
fi

mkdir -p "$OPENCLAW_HOME"

echo "[docker-init] OpenClaw home: $OPENCLAW_HOME"

start_sglang_adapter() {
  if [[ "$LOCAL_TOOLCALL_ADAPTER" != "sglang" ]]; then
    echo "[docker-init] local toolcall adapter disabled: $LOCAL_TOOLCALL_ADAPTER"
    return 0
  fi

  if [[ ! -f "$SGLANG_ADAPTER_SCRIPT" ]]; then
    echo "[docker-init] missing adapter script: $SGLANG_ADAPTER_SCRIPT" >&2
    return 1
  fi

  local health_url="${LOCAL_TOOLCALL_ADAPTER_BASE_URL%/}/models"
  if curl -fsS "$health_url" >/dev/null 2>&1; then
    echo "[docker-init] sglang adapter already healthy: $health_url"
    return 0
  fi

  echo "[docker-init] starting sglang adapter -> $health_url (upstream: $SGLANG_UPSTREAM_BASE_URL)"
  pkill -f "$SGLANG_ADAPTER_SCRIPT" >/dev/null 2>&1 || true
  nohup env \
    SGLANG_UPSTREAM_BASE_URL="$SGLANG_UPSTREAM_BASE_URL" \
    SGLANG_ADAPTER_HOST="$SGLANG_ADAPTER_HOST" \
    SGLANG_ADAPTER_PORT="$SGLANG_ADAPTER_PORT" \
    SGLANG_ADAPTER_STREAM_MODE="$SGLANG_ADAPTER_STREAM_MODE" \
    SGLANG_ADAPTER_STREAM_FALLBACK="$SGLANG_ADAPTER_STREAM_FALLBACK" \
    node "$SGLANG_ADAPTER_SCRIPT" >"$SGLANG_ADAPTER_LOG" 2>&1 &

  for i in $(seq 1 20); do
    if curl -fsS "$health_url" >/dev/null 2>&1; then
      echo "[docker-init] sglang adapter healthy"
      return 0
    fi
    sleep 1
  done

  echo "[docker-init] sglang adapter failed to become healthy; log: $SGLANG_ADAPTER_LOG" >&2
  return 1
}

patch_control_ui_token_persistence() {
  if ! python3 - <<'PY'
from pathlib import Path
import glob

paths = [Path(p) for p in glob.glob("/app/dist/control-ui/assets/index-*.js")]
if not paths:
    raise SystemExit(0)

read_old = "token:t.token"
read_new = 'token:typeof s.token=="string"&&s.token.trim()?s.token.trim():t.token'
write_old = "const t={gatewayUrl:e.gatewayUrl,sessionKey:e.sessionKey,lastActiveSessionKey:e.lastActiveSessionKey"
write_new = "const t={gatewayUrl:e.gatewayUrl,token:e.token,sessionKey:e.sessionKey,lastActiveSessionKey:e.lastActiveSessionKey"

patched_any = False
saw_markers = False
for path in paths:
    content = path.read_text(encoding="utf-8")
    updated = content
    changed = False
    if any(marker in content for marker in (read_old, read_new, write_old, write_new)):
        saw_markers = True
    if read_old in updated:
        updated = updated.replace(read_old, read_new, 1)
        changed = True
    if write_old in updated:
        updated = updated.replace(write_old, write_new, 1)
        changed = True
    if changed:
        path.write_text(updated, encoding="utf-8")
        patched_any = True

if not saw_markers:
    raise SystemExit("[docker-init] failed to locate Control UI token persistence markers")

if patched_any:
    print("[docker-init] patched Control UI token persistence")
else:
    print("[docker-init] Control UI token persistence already patched")
PY
  then
    echo "[docker-init] warning: failed to patch Control UI token persistence" >&2
  fi
}

if [[ ! -f "$OPENCLAW_CONFIG" ]]; then
  echo "[docker-init] fresh instance detected (no config file yet)"
  if [[ "${OPENCLAW_DOCKER_AUTO_ONBOARD:-false}" == "true" ]]; then
    if [[ -t 0 && -t 1 ]]; then
      echo "[docker-init] running openclaw onboard"
      if ! openclaw onboard; then
        echo "[docker-init] onboard failed, run manually: openclaw onboard" >&2
      fi
    else
      echo "[docker-init] auto-onboard requested but no TTY; skipping" >&2
    fi
  else
    echo "[docker-init] auto-onboard disabled"
  fi
else
  echo "[docker-init] existing config found: $OPENCLAW_CONFIG"
fi

patch_control_ui_token_persistence
start_sglang_adapter

if [[ "${OPENCLAW_DOCKER_GATEWAY:-true}" == "true" ]]; then
  echo "[docker-init] starting gateway (container mode)"
  nohup openclaw gateway run --allow-unconfigured >"$OPENCLAW_HOME/gateway.log" 2>&1 &
  for i in $(seq 1 30); do
    if openclaw gateway health >/dev/null 2>&1; then
      echo "[docker-init] gateway healthy"
      echo "[docker-init] done"
      exit 0
    fi
    sleep 1
  done
  echo "[docker-init] gateway failed to become healthy; log: $OPENCLAW_HOME/gateway.log" >&2
  exit 1
fi

echo "[docker-init] done"
