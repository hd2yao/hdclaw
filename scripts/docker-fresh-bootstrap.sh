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
TELEGRAM_GPT_GROUP_ID="${OPENCLAW_TELEGRAM_GPT_GROUP_ID:-}"
TELEGRAM_QWEN_GROUP_ID="${OPENCLAW_TELEGRAM_QWEN_GROUP_ID:-}"
TELEGRAM_GPT_AGENT_ID="${OPENCLAW_TELEGRAM_GPT_AGENT_ID:-telegram-gpt}"
TELEGRAM_QWEN_AGENT_ID="${OPENCLAW_TELEGRAM_QWEN_AGENT_ID:-telegram-qwen}"
TELEGRAM_GPT_MODEL="${OPENCLAW_TELEGRAM_GPT_MODEL:-openai-codex/gpt-5.3-codex}"
TELEGRAM_QWEN_MODEL="${OPENCLAW_TELEGRAM_QWEN_MODEL:-local//data/qwen3.5-27b}"
TELEGRAM_GROUP_REQUIRE_MENTION="${OPENCLAW_TELEGRAM_GROUP_REQUIRE_MENTION:-true}"
SKIP_BUILD="${OPENCLAW_SKIP_BUILD:-0}"
LOCAL_BASE_URL="${OPENCLAW_LOCAL_BASE_URL:-http://192.168.6.230:30000/v1}"
LOCAL_TOOLCALL_ADAPTER="${OPENCLAW_LOCAL_TOOLCALL_ADAPTER:-sglang}"
LOCAL_TOOLCALL_ADAPTER_BASE_URL="${OPENCLAW_LOCAL_TOOLCALL_ADAPTER_BASE_URL:-http://127.0.0.1:31001/v1}"
LOCAL_MODEL_PARAMS_JSON="${OPENCLAW_LOCAL_MODEL_PARAMS_JSON:-}"
if [[ -z "$LOCAL_MODEL_PARAMS_JSON" ]]; then
  LOCAL_MODEL_PARAMS_JSON='{"chat_template_kwargs":{"enable_thinking":false}}'
fi

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

configure_local_model_params() {
  log "ensuring local qwen model params"
  compose exec -T "$SERVICE" sh -lc "set -e
    LOCAL_MODEL_PARAMS_JSON='$LOCAL_MODEL_PARAMS_JSON' node - <<'NODE'
const fs = require('fs');

const configPath = '/home/node/.openclaw/openclaw.json';
const raw = process.env.LOCAL_MODEL_PARAMS_JSON || '';
const params = JSON.parse(raw);
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const provider = config?.models?.providers?.local;

if (!provider || !Array.isArray(provider.models) || provider.models.length === 0) {
  console.log('[docker-fresh-bootstrap] local provider not configured; skip local model params');
  process.exit(0);
}

const modelId = provider.models[0]?.id;
if (!modelId) {
  console.log('[docker-fresh-bootstrap] local model id missing; skip local model params');
  process.exit(0);
}

const modelKey = 'local/' + modelId;
config.agents ||= {};
config.agents.defaults ||= {};
config.agents.defaults.models ||= {};
config.agents.defaults.models[modelKey] ||= {};
config.agents.defaults.models[modelKey].params = params;

fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log(JSON.stringify({ modelKey, params }, null, 2));
NODE
    openclaw config validate >/dev/null"
}

configure_local_provider_connection() {
  log "configuring local provider connection"
  compose exec -T "$SERVICE" sh -lc "set -e
    LOCAL_BASE_URL='$LOCAL_BASE_URL' \
    LOCAL_TOOLCALL_ADAPTER='$LOCAL_TOOLCALL_ADAPTER' \
    LOCAL_TOOLCALL_ADAPTER_BASE_URL='$LOCAL_TOOLCALL_ADAPTER_BASE_URL' \
    node - <<'NODE'
const fs = require('fs');

const configPath = '/home/node/.openclaw/openclaw.json';
const localBaseUrl = process.env.LOCAL_BASE_URL || '';
const adapterMode = process.env.LOCAL_TOOLCALL_ADAPTER || 'sglang';
const adapterBaseUrl = process.env.LOCAL_TOOLCALL_ADAPTER_BASE_URL || '';
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const provider = config?.models?.providers?.local;

if (!provider || typeof provider !== 'object') {
  console.log('[docker-fresh-bootstrap] local provider not configured; skip provider baseUrl');
  process.exit(0);
}

provider.baseUrl = adapterMode === 'sglang' ? adapterBaseUrl : localBaseUrl;

fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log(JSON.stringify({
  adapterMode,
  providerBaseUrl: provider.baseUrl,
}, null, 2));
NODE
    openclaw config validate >/dev/null"
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

configure_telegram_group_agents() {
  if [[ -z "$TELEGRAM_GPT_GROUP_ID" && -z "$TELEGRAM_QWEN_GROUP_ID" ]]; then
    log "telegram group agent routing not configured; skip multi-agent setup"
    return
  fi

  if [[ -z "$TELEGRAM_GPT_GROUP_ID" || -z "$TELEGRAM_QWEN_GROUP_ID" ]]; then
    echo "both OPENCLAW_TELEGRAM_GPT_GROUP_ID and OPENCLAW_TELEGRAM_QWEN_GROUP_ID are required for dual-agent telegram routing" >&2
    exit 1
  fi

  if [[ -z "$TELEGRAM_ALLOW_FROM" ]]; then
    echo "OPENCLAW_TELEGRAM_ALLOW_FROM is required when configuring telegram group agents" >&2
    exit 1
  fi

  log "configuring telegram group agents and bindings"
  compose exec -T "$SERVICE" sh -lc "set -e
    TELEGRAM_ALLOW_FROM='$TELEGRAM_ALLOW_FROM' \
    TELEGRAM_GPT_GROUP_ID='$TELEGRAM_GPT_GROUP_ID' \
    TELEGRAM_QWEN_GROUP_ID='$TELEGRAM_QWEN_GROUP_ID' \
    TELEGRAM_GPT_AGENT_ID='$TELEGRAM_GPT_AGENT_ID' \
    TELEGRAM_QWEN_AGENT_ID='$TELEGRAM_QWEN_AGENT_ID' \
    TELEGRAM_GPT_MODEL='$TELEGRAM_GPT_MODEL' \
    TELEGRAM_QWEN_MODEL='$TELEGRAM_QWEN_MODEL' \
    TELEGRAM_GROUP_REQUIRE_MENTION='$TELEGRAM_GROUP_REQUIRE_MENTION' \
    node - <<'NODE'
const fs = require('fs');

const configPath = '/home/node/.openclaw/openclaw.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const allowFrom = (process.env.TELEGRAM_ALLOW_FROM || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const gptGroupId = (process.env.TELEGRAM_GPT_GROUP_ID || '').trim();
const qwenGroupId = (process.env.TELEGRAM_QWEN_GROUP_ID || '').trim();
const gptAgentId = (process.env.TELEGRAM_GPT_AGENT_ID || 'telegram-gpt').trim();
const qwenAgentId = (process.env.TELEGRAM_QWEN_AGENT_ID || 'telegram-qwen').trim();
const gptModel = (process.env.TELEGRAM_GPT_MODEL || 'openai-codex/gpt-5.3-codex').trim();
const qwenModel = (process.env.TELEGRAM_QWEN_MODEL || 'local//data/qwen3.5-27b').trim();
const requireMention = String(process.env.TELEGRAM_GROUP_REQUIRE_MENTION || 'true').trim().toLowerCase() !== 'false';
const sharedWorkspace = config?.agents?.defaults?.workspace || '/home/node/.openclaw/workspace';
const defaultPrimaryModel = config?.agents?.defaults?.model?.primary || 'openai-codex/gpt-5.3-codex';
const existingGroupAllowFrom = Array.isArray(config?.channels?.telegram?.groupAllowFrom)
  ? config.channels.telegram.groupAllowFrom.map((value) => String(value).trim()).filter(Boolean)
  : [];

config.agents ||= {};
config.agents.list ||= [];
config.bindings ||= [];
config.channels ||= {};
config.channels.telegram ||= {};
config.channels.telegram.groups ||= {};

const upsertAgent = (id, name, model) => {
  const current = config.agents.list.find((entry) => entry && entry.id === id);
  const next = {
    ...(current || {}),
    id,
    name,
    workspace: current?.workspace || sharedWorkspace,
    model,
  };
  if (!current) config.agents.list.push(next);
  else Object.assign(current, next);
};

upsertAgent('main', 'Main', defaultPrimaryModel);
upsertAgent(gptAgentId, 'Telegram GPT', gptModel);
upsertAgent(qwenAgentId, 'Telegram Qwen', qwenModel);

for (const entry of config.agents.list) {
  if (!entry || typeof entry !== 'object') continue;
  if (entry.id === 'main') entry.default = true;
  else if ([gptAgentId, qwenAgentId].includes(entry.id) && entry.default) delete entry.default;
}

config.channels.telegram.groupAllowFrom = Array.from(new Set([...existingGroupAllowFrom, ...allowFrom]));

for (const groupId of [gptGroupId, qwenGroupId]) {
  config.channels.telegram.groups[groupId] = {
    ...(config.channels.telegram.groups[groupId] || {}),
    requireMention,
    enabled: true,
  };
}

const isSamePeer = (binding, groupId) =>
  binding?.match?.channel === 'telegram' &&
  binding?.match?.peer?.kind === 'group' &&
  String(binding?.match?.peer?.id || '') === String(groupId);

config.bindings = config.bindings.filter(
  (binding) =>
    ![gptAgentId, qwenAgentId].includes(binding?.agentId) &&
    !isSamePeer(binding, gptGroupId) &&
    !isSamePeer(binding, qwenGroupId),
);

config.bindings.unshift(
  {
    agentId: qwenAgentId,
    match: { channel: 'telegram', peer: { kind: 'group', id: qwenGroupId } },
  },
  {
    agentId: gptAgentId,
    match: { channel: 'telegram', peer: { kind: 'group', id: gptGroupId } },
  },
);

fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\\n');
console.log(JSON.stringify({
  agents: config.agents.list.filter((entry) => ['main', gptAgentId, qwenAgentId].includes(entry.id)),
  bindings: config.bindings.filter((binding) => [gptAgentId, qwenAgentId].includes(binding.agentId)),
  groupAllowFrom: config.channels.telegram.groupAllowFrom,
  groups: {
    [gptGroupId]: config.channels.telegram.groups[gptGroupId],
    [qwenGroupId]: config.channels.telegram.groups[qwenGroupId],
  },
}, null, 2));
NODE
    openclaw config validate >/dev/null"
}

ensure_weixin_read_runtime() {
  log "ensuring weixin-read-mcp python dependencies"
  compose exec -T "$SERVICE" sh -lc '
    set -e
    REQ=/home/node/.openclaw/workspace/wexin-read-mcp/requirements.txt
    if [ -f "$REQ" ]; then
      python3 -m pip install --user --break-system-packages -r "$REQ"
    else
      echo "weixin-read-mcp requirements not found; skip python dependency install"
    fi
  '
}

ensure_playwright_runtime() {
  log "ensuring Playwright browser runtime"
  compose exec -T "$SERVICE" sh -lc '
    set -e
    if python3 - <<'"'"'PY'"'"'
import importlib.util
raise SystemExit(0 if importlib.util.find_spec("playwright") else 1)
PY
    then
      python3 -m playwright install chromium
    else
      echo "playwright python package not installed; skip browser install"
    fi
  '
}

start_node_host() {
  log "starting node host"
  compose exec -T "$SERVICE" sh -lc '
    pids="$(ps -ef | grep "[o]penclaw node run --host 127.0.0.1 --port 18789" | awk "{print \$2}")"
    if [ -n "$pids" ]; then
      echo "$pids" | xargs -r kill || true
    fi
    nohup openclaw node run --host 127.0.0.1 --port 18789 >> /home/node/.openclaw/node.log 2>&1 &
  '
  sleep 2
  compose exec -T "$SERVICE" sh -lc 'openclaw gateway call node.list --json || true'
}

verify_state() {
  log "verifying final state"
  compose exec -T "$SERVICE" sh -lc '
    set -e
    if [ "${OPENCLAW_LOCAL_TOOLCALL_ADAPTER:-sglang}" = "sglang" ]; then
      curl -fsS "${OPENCLAW_LOCAL_TOOLCALL_ADAPTER_BASE_URL:-http://127.0.0.1:31001/v1}/models" >/tmp/openclaw-adapter-models.json
    fi
    openclaw config get tools.exec --json
    openclaw config get tools.elevated --json
    openclaw config get models.providers.local --json
    openclaw config get agents.defaults.models --json
    if [ -n "${OPENCLAW_TELEGRAM_GPT_GROUP_ID:-}" ] && [ -n "${OPENCLAW_TELEGRAM_QWEN_GROUP_ID:-}" ]; then
      openclaw config get agents.list --json
      openclaw config get bindings --json
      openclaw config get channels.telegram.groups --json
      openclaw agents list --bindings || true
    fi
    if [ -f /tmp/openclaw-adapter-models.json ]; then
      cat /tmp/openclaw-adapter-models.json
    fi
    python3 --version
    pip3 --version
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
  configure_local_provider_connection
  configure_local_model_params
  configure_exec_approvals
  configure_telegram_group_agents
  ensure_weixin_read_runtime
  ensure_playwright_runtime

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
