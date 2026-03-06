#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f "$ROOT_DIR/.env.local" ]]; then
  # Optional: allow users to define docker bootstrap vars in .env.local.
  set -a
  # shellcheck source=/dev/null
  source "$ROOT_DIR/.env.local"
  set +a
fi

DOCKER_STACK="${DOCKER_STACK:-openclaw-fresh}"
COMPOSE_FILE="${ROOT_DIR}/containers/${DOCKER_STACK}/docker-compose.yml"
SERVICE="${OPENCLAW_DOCKER_SERVICE:-openclaw}"
DASHBOARD_PORT="${OPENCLAW_DASHBOARD_PORT:-18790}"
TELEGRAM_ALLOW_FROM="${OPENCLAW_TELEGRAM_ALLOW_FROM:-}"
SKIP_BUILD="${OPENCLAW_SKIP_BUILD:-0}"

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 1
  fi
}

log() {
  printf '[docker-fresh-bootstrap] %s\n' "$*"
}

compose() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

wait_gateway() {
  compose exec -T "$SERVICE" sh -lc '
    for i in $(seq 1 30); do
      if openclaw gateway health --json >/tmp/openclaw-gateway-health.json 2>/tmp/openclaw-gateway-health.err; then
        cat /tmp/openclaw-gateway-health.json
        exit 0
      fi
      sleep 2
    done
    cat /tmp/openclaw-gateway-health.err
    exit 1
  '
}

csv_to_json_array() {
  local input="$1"
  local out='['
  local first=1
  local part trimmed
  IFS=',' read -r -a parts <<< "$input"
  for part in "${parts[@]}"; do
    trimmed="$(echo "$part" | xargs)"
    [[ -z "$trimmed" ]] && continue
    if [[ "$first" -eq 0 ]]; then
      out+=", "
    fi
    out+="\"$trimmed\""
    first=0
  done
  out+=']'
  printf '%s' "$out"
}

configure_openclaw() {
  log "applying OpenClaw config"
  compose exec -T "$SERVICE" sh -lc '
    set -e
    openclaw config set tools.profile full
    openclaw config set commands.bash true
    openclaw config set tools.exec.host gateway
    openclaw config set tools.exec.security full
    openclaw config set tools.exec.ask off
    openclaw config set tools.elevated.enabled true
    openclaw config set plugins.entries.acpx.enabled true
    openclaw config set plugins.entries.acpx.config.permissionMode approve-all
    openclaw config set plugins.entries.acpx.config.nonInteractivePermissions fail
    openclaw config set gateway.controlUi.allowInsecureAuth true
    openclaw config set gateway.controlUi.dangerouslyDisableDeviceAuth true
  '

  local origins_json
  origins_json=$(printf '["http://localhost:%s","http://127.0.0.1:%s","http://localhost:18789","http://127.0.0.1:18789"]' "$DASHBOARD_PORT" "$DASHBOARD_PORT")
  compose exec -T "$SERVICE" sh -lc "openclaw config set --strict-json gateway.controlUi.allowedOrigins '$origins_json'"

  if [[ -n "$TELEGRAM_ALLOW_FROM" ]]; then
    local telegram_json
    telegram_json="$(csv_to_json_array "$TELEGRAM_ALLOW_FROM")"
    compose exec -T "$SERVICE" sh -lc "openclaw config set --strict-json tools.elevated.allowFrom.telegram '$telegram_json'"
  else
    log "OPENCLAW_TELEGRAM_ALLOW_FROM not set; skip tools.elevated.allowFrom.telegram"
  fi

  compose exec -T "$SERVICE" sh -lc '
    set -e
    mkdir -p /home/node/.openclaw/acpx-runtime
    if [ ! -x /home/node/.openclaw/acpx-runtime/node_modules/.bin/acpx ]; then
      npm install --omit=dev --prefix /home/node/.openclaw/acpx-runtime acpx@0.1.15
    fi
    openclaw config set plugins.entries.acpx.config.command /home/node/.openclaw/acpx-runtime/node_modules/.bin/acpx
    openclaw config set plugins.entries.acpx.config.expectedVersion 0.1.15
    openclaw config validate
  '
}

configure_exec_approvals() {
  log "setting exec approvals to full/off"
  compose exec -T "$SERVICE" sh -lc '
    node -e "
      const fs=require(\"fs\");
      const p=\"/home/node/.openclaw/exec-approvals.json\";
      let data={version:1,socket:{path:\"/home/node/.openclaw/exec-approvals.sock\"},defaults:{},agents:{}};
      try{ data=JSON.parse(fs.readFileSync(p,\"utf8\")); }catch{}
      if(!data.defaults||typeof data.defaults!==\"object\") data.defaults={};
      data.defaults.security=\"full\";
      data.defaults.ask=\"off\";
      data.defaults.askFallback=\"full\";
      data.defaults.autoAllowSkills=true;
      if(!data.agents||typeof data.agents!==\"object\") data.agents={};
      if(!data.agents.main||typeof data.agents.main!==\"object\") data.agents.main={};
      data.agents.main.security=\"full\";
      data.agents.main.ask=\"off\";
      data.agents.main.askFallback=\"full\";
      data.agents.main.autoAllowSkills=true;
      if(!Array.isArray(data.agents.main.allowlist)) data.agents.main.allowlist=[];
      fs.writeFileSync(p, JSON.stringify(data,null,2));
    "
  '
}

start_node_host() {
  log "starting node host"
  compose exec -T "$SERVICE" sh -lc '
    pkill -f "openclaw node run --host 127.0.0.1 --port 18789" >/dev/null 2>&1 || true
    nohup openclaw node run --host 127.0.0.1 --port 18789 >> /home/node/.openclaw/node.log 2>&1 &
  '
  sleep 2
  compose exec -T "$SERVICE" sh -lc 'openclaw gateway call node.list --json || true'
}

verify_state() {
  log "verifying final state"
  compose exec -T "$SERVICE" sh -lc '
    set -e
    openclaw config get tools.exec --json
    openclaw config get tools.elevated --json
    command -v sudo >/dev/null 2>&1 && sudo -n whoami
    ls -ld /home/node/.openclaw/workspace/obsidian_vault
  '
}

main() {
  need_cmd docker
  [[ -f "$COMPOSE_FILE" ]] || {
    echo "compose file not found: $COMPOSE_FILE" >&2
    exit 1
  }

  log "stack=$DOCKER_STACK service=$SERVICE compose=$COMPOSE_FILE"
  log "dashboard_port=$DASHBOARD_PORT skip_build=$SKIP_BUILD"

  if [[ "$SKIP_BUILD" != "1" ]]; then
    log "building image"
    compose build "$SERVICE"
  fi

  log "starting container"
  compose up -d --force-recreate "$SERVICE"

  log "waiting for gateway health"
  wait_gateway >/dev/null

  configure_openclaw
  configure_exec_approvals

  log "restarting container to apply config cleanly"
  compose restart "$SERVICE" >/dev/null
  wait_gateway >/dev/null

  start_node_host
  verify_state

  cat <<EOF

[docker-fresh-bootstrap] done
Next manual steps (if not yet configured):
1) Open Dashboard: http://127.0.0.1:${DASHBOARD_PORT}/
2) Complete OpenAI Codex OAuth login in container session
3) Pair Telegram device and approve channel pairing
EOF
}

main "$@"
