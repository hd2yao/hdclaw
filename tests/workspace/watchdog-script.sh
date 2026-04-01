#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT_PATH="$ROOT_DIR/scripts/openclaw-watchdog.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "[test-watchdog] expecting watchdog script at $SCRIPT_PATH"
[[ -x "$SCRIPT_PATH" ]] || {
  echo "[test-watchdog] missing executable script: $SCRIPT_PATH" >&2
  exit 1
}

make_fixture_dir() {
  local dir="$1"
  mkdir -p "$dir"
}

write_fixture() {
  local dir="$1"
  local probe_json="$2"
  local sessions_json="$3"
  local store_json="$4"
  local logs_text="$5"

  printf '%s\n' "$probe_json" > "$dir/probe.json"
  printf '%s\n' "$sessions_json" > "$dir/sessions-summary.json"
  printf '%s\n' "$store_json" > "$dir/sessions-store.json"
  printf '%s\n' "$logs_text" > "$dir/logs.txt"
}

echo "[test-watchdog] case1: active conversation above warn threshold should prompt manual compact"
FIX1="$TMP_DIR/active-manual"
make_fixture_dir "$FIX1"
write_fixture "$FIX1" '
{
  "ts": 1711936800000,
  "channelAccounts": {
    "telegram": [
      {
        "accountId": "default",
        "running": true,
        "probe": { "ok": true },
        "lastInboundAt": 1711936500000,
        "lastOutboundAt": 1711936440000
      }
    ]
  }
}
' '
{
  "sessions": [
    {
      "key": "agent:main:telegram:direct:1871908422",
      "updatedAt": 1711936500000,
      "sessionId": "active-session",
      "compactionCount": 0,
      "totalTokens": 208000,
      "contextTokens": 272000,
      "agentId": "main",
      "kind": "direct"
    }
  ]
}
' '
{
  "agent:main:telegram:direct:1871908422": {
    "sessionId": "active-session",
    "sessionFile": "/tmp/active-session.jsonl",
    "deliveryContext": {
      "channel": "telegram",
      "to": "telegram:1871908422",
      "accountId": "default"
    },
    "origin": {
      "from": "telegram:1871908422"
    }
  }
}
' 'INFO nothing to see here'

status_out="$(
  OPENCLAW_WATCHDOG_FIXTURE_DIR="$FIX1" \
  OPENCLAW_WATCHDOG_STATE_PATH="$TMP_DIR/state.json" \
  OPENCLAW_WATCHDOG_NOW_MS=1711936800000 \
  bash "$SCRIPT_PATH" status
)"

echo "$status_out" | jq -e '.decision.mode == "manual_prompt"' >/dev/null || {
  echo "[test-watchdog] expected manual_prompt mode" >&2
  exit 1
}

echo "$status_out" | jq -e '.decision.suggestedAction == "compact"' >/dev/null || {
  echo "[test-watchdog] expected compact suggestion" >&2
  exit 1
}

echo "$status_out" | jq -e '.context.percent == 76' >/dev/null || {
  echo "[test-watchdog] expected context percent 76" >&2
  exit 1
}

echo "[test-watchdog] case2: unattended critical context should auto-rotate to a new session"
FIX2="$TMP_DIR/unattended-auto-new"
make_fixture_dir "$FIX2"
cat > "$FIX2/session.jsonl" <<'EOF'
{"type":"session","id":"stale-session"}
EOF
write_fixture "$FIX2" '
{
  "ts": 1711936800000,
  "channelAccounts": {
    "telegram": [
      {
        "accountId": "default",
        "running": true,
        "probe": { "ok": true },
        "lastInboundAt": 1711930800000,
        "lastOutboundAt": 1711930200000
      }
    ]
  }
}
' '
{
  "sessions": [
    {
      "key": "agent:main:telegram:direct:1871908422",
      "updatedAt": 1711930800000,
      "sessionId": "stale-session",
      "compactionCount": 1,
      "totalTokens": 258400,
      "contextTokens": 272000,
      "agentId": "main",
      "kind": "direct"
    }
  ]
}
' "
{
  \"agent:main:telegram:direct:1871908422\": {
    \"sessionId\": \"stale-session\",
    \"sessionFile\": \"$FIX2/session.jsonl\",
    \"deliveryContext\": {
      \"channel\": \"telegram\",
      \"to\": \"telegram:1871908422\",
      \"accountId\": \"default\"
    },
    \"origin\": {
      \"from\": \"telegram:1871908422\"
    }
  }
}
" 'WARN recent history
ERROR LLM request timed out.
ERROR LLM request timed out.'

run_out="$(
  OPENCLAW_WATCHDOG_FIXTURE_DIR="$FIX2" \
  OPENCLAW_WATCHDOG_STATE_PATH="$TMP_DIR/state.json" \
  OPENCLAW_WATCHDOG_STALL_MINUTES=180 \
  OPENCLAW_WATCHDOG_NOW_MS=1711936800000 \
  bash "$SCRIPT_PATH" run-once
)"

echo "$run_out" | jq -e '.decision.mode == "auto_recover"' >/dev/null || {
  echo "[test-watchdog] expected auto_recover mode" >&2
  exit 1
}

echo "$run_out" | jq -e '.decision.appliedAction == "new_session"' >/dev/null || {
  echo "[test-watchdog] expected new_session action" >&2
  exit 1
}

echo "$run_out" | jq -e '.decision.executed == true' >/dev/null || {
  echo "[test-watchdog] expected action to execute in fixture mode" >&2
  exit 1
}

find "$FIX2" -maxdepth 1 -type f -name 'session.jsonl.reset.*' | grep -q . || {
  echo "[test-watchdog] expected transcript backup after rotate" >&2
  exit 1
}

cat "$FIX2/sessions-store.json" | jq -e 'has("agent:main:telegram:direct:1871908422") | not' >/dev/null || {
  echo "[test-watchdog] expected session store entry removed after rotate" >&2
  exit 1
}

echo "[test-watchdog] case3: telegram polling stall should choose gateway restart"
FIX3="$TMP_DIR/gateway-stall"
make_fixture_dir "$FIX3"
write_fixture "$FIX3" '
{
  "ts": 1711936800000,
  "channelAccounts": {
    "telegram": [
      {
        "accountId": "default",
        "running": true,
        "probe": { "ok": true },
        "lastInboundAt": 1711932000000,
        "lastOutboundAt": 1711931400000
      }
    ]
  }
}
' '
{
  "sessions": [
    {
      "key": "agent:main:telegram:direct:1871908422",
      "updatedAt": 1711932000000,
      "sessionId": "idle-session",
      "compactionCount": 0,
      "totalTokens": 42000,
      "contextTokens": 272000,
      "agentId": "main",
      "kind": "direct"
    }
  ]
}
' '
{
  "agent:main:telegram:direct:1871908422": {
    "sessionId": "idle-session",
    "sessionFile": "/tmp/idle-session.jsonl",
    "deliveryContext": {
      "channel": "telegram",
      "to": "telegram:1871908422",
      "accountId": "default"
    },
    "origin": {
      "from": "telegram:1871908422"
    }
  }
}
' 'WARN Polling stall detected (no getUpdates for 90.01s); forcing restart'

stall_out="$(
  OPENCLAW_WATCHDOG_FIXTURE_DIR="$FIX3" \
  OPENCLAW_WATCHDOG_STATE_PATH="$TMP_DIR/state.json" \
  OPENCLAW_WATCHDOG_NOW_MS=1711936800000 \
  bash "$SCRIPT_PATH" run-once --dry-run
)"

echo "$stall_out" | jq -e '.decision.appliedAction == "restart_gateway"' >/dev/null || {
  echo "[test-watchdog] expected restart_gateway action" >&2
  exit 1
}

echo "$stall_out" | jq -e '.decision.executed == false' >/dev/null || {
  echo "[test-watchdog] expected dry-run to avoid execution" >&2
  exit 1
}

echo "[test-watchdog] passed"
