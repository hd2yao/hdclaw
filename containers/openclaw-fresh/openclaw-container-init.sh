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
      echo "[docker-init] skip onboard (no interactive TTY)"
      echo "[docker-init] run inside container: openclaw onboard"
    fi
  else
    echo "[docker-init] run inside container: openclaw onboard"
  fi
else
  echo "[docker-init] existing config found: $OPENCLAW_CONFIG"
  # In Docker, loopback bind inside container is not reachable from host port mapping.
  if ! openclaw config set gateway.bind lan >/dev/null 2>&1; then
    echo "[docker-init] warning: failed to set gateway.bind=lan"
  fi
  # Strings such as dnsResultOrder are easier to patch safely via JSON.
  if ! OPENCLAW_CONFIG="$OPENCLAW_CONFIG" DASHBOARD_PORT="$DASHBOARD_PORT" TELEGRAM_AUTO_SELECT_FAMILY="$TELEGRAM_AUTO_SELECT_FAMILY" TELEGRAM_DNS_RESULT_ORDER="$TELEGRAM_DNS_RESULT_ORDER" python3 - <<'PY'
import json
import os

config_path = os.environ["OPENCLAW_CONFIG"]
dashboard_port = os.environ["DASHBOARD_PORT"]
auto_select_family = os.environ.get("TELEGRAM_AUTO_SELECT_FAMILY", "").strip().lower()
dns_result_order = os.environ.get("TELEGRAM_DNS_RESULT_ORDER", "").strip()

with open(config_path, "r", encoding="utf-8") as fh:
    config = json.load(fh)

control_ui = config.setdefault("gateway", {}).setdefault("controlUi", {})
control_ui["allowedOrigins"] = [
    f"http://localhost:{dashboard_port}",
    f"http://127.0.0.1:{dashboard_port}",
    "http://localhost:18789",
    "http://127.0.0.1:18789",
]

if auto_select_family:
    telegram_network = config.setdefault("channels", {}).setdefault("telegram", {}).setdefault("network", {})
    telegram_network["autoSelectFamily"] = auto_select_family == "true"
    if dns_result_order:
        telegram_network["dnsResultOrder"] = dns_result_order

with open(config_path, "w", encoding="utf-8") as fh:
    json.dump(config, fh, ensure_ascii=False, indent=2)
    fh.write("\n")
PY
  then
    echo "[docker-init] warning: failed to patch gateway.controlUi/telegram.network"
  fi
  # Docker containers are typically single-operator local environments.
  # Disabling device auth avoids repetitive Control UI pairing prompts.
  if [[ "${OPENCLAW_DOCKER_DISABLE_DEVICE_AUTH:-true}" == "true" ]]; then
    if ! openclaw config set gateway.controlUi.dangerouslyDisableDeviceAuth true --strict-json >/dev/null 2>&1; then
      echo "[docker-init] warning: failed to disable Control UI device auth"
    fi
  fi
  # Relax browser checks for localhost/port-mapped Control UI in single-user Docker setups.
  if [[ "${OPENCLAW_DOCKER_ALLOW_INSECURE_CONTROL_UI_AUTH:-true}" == "true" ]]; then
    if ! openclaw config set gateway.controlUi.allowInsecureAuth true --strict-json >/dev/null 2>&1; then
      echo "[docker-init] warning: failed to set gateway.controlUi.allowInsecureAuth=true"
    fi
  fi
  # Enable a minimal default set of channel plugins so Channel schemas render out-of-the-box.
  if [[ "${OPENCLAW_DOCKER_ENABLE_CHANNEL_PLUGINS:-true}" == "true" ]]; then
    CHANNEL_PLUGINS="${CHANNEL_PLUGINS_RAW//,/ }"
    for plugin_id in $CHANNEL_PLUGINS; do
      [[ -n "$plugin_id" ]] || continue
      if ! openclaw plugins enable "$plugin_id" >/dev/null 2>&1; then
        echo "[docker-init] warning: failed to enable plugin '$plugin_id'"
      fi
    done
  fi
fi

patch_control_ui_token_persistence
start_sglang_adapter

if [[ "${OPENCLAW_DOCKER_GATEWAY:-false}" == "true" ]]; then
  if openclaw gateway health >/dev/null 2>&1; then
    echo "[docker-init] gateway already healthy"
  else
    echo "[docker-init] starting gateway (container mode)"
    nohup openclaw gateway run --allow-unconfigured >"$OPENCLAW_HOME/gateway.log" 2>&1 &
    for i in 1 2 3 4 5 6 7 8 9 10; do
      if openclaw gateway health >/dev/null 2>&1; then
        echo "[docker-init] gateway healthy"
        break
      fi
      sleep 1
    done
  fi
fi

echo "[docker-init] done"
