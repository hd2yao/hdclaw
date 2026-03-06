#!/usr/bin/env bash
set -euo pipefail

OPENCLAW_HOME="${OPENCLAW_HOME:-$HOME/.openclaw}"
OPENCLAW_CONFIG="${OPENCLAW_CONFIG_PATH:-$OPENCLAW_HOME/openclaw.json}"
DASHBOARD_PORT="${OPENCLAW_DASHBOARD_PORT:-18790}"
CHANNEL_PLUGINS_RAW="${OPENCLAW_DOCKER_CHANNEL_PLUGINS:-telegram,whatsapp}"

if ! command -v openclaw >/dev/null 2>&1; then
  echo "[docker-init] missing required command: openclaw" >&2
  exit 1
fi

mkdir -p "$OPENCLAW_HOME"

echo "[docker-init] OpenClaw home: $OPENCLAW_HOME"

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
  # Allow both host-mapped and in-container Control UI origins.
  allowed_origins_json="[\"http://localhost:${DASHBOARD_PORT}\",\"http://127.0.0.1:${DASHBOARD_PORT}\",\"http://localhost:18789\",\"http://127.0.0.1:18789\"]"
  if ! openclaw config set gateway.controlUi.allowedOrigins "$allowed_origins_json" --strict-json >/dev/null 2>&1; then
    echo "[docker-init] warning: failed to set gateway.controlUi.allowedOrigins"
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
