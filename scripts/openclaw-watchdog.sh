#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="${OPENCLAW_WATCHDOG_CONTAINER:-openclaw-official-openclaw-1}"
AGENT_ID="${OPENCLAW_WATCHDOG_AGENT_ID:-main}"
SESSION_KEY_OVERRIDE="${OPENCLAW_WATCHDOG_SESSION_KEY:-}"
STATE_PATH="${OPENCLAW_WATCHDOG_STATE_PATH:-$HOME/.openclaw/watchdog-state.json}"
FIXTURE_DIR="${OPENCLAW_WATCHDOG_FIXTURE_DIR:-}"
WARN_PERCENT="${OPENCLAW_WATCHDOG_WARN_PERCENT:-70}"
HIGH_PERCENT="${OPENCLAW_WATCHDOG_HIGH_PERCENT:-85}"
CRITICAL_PERCENT="${OPENCLAW_WATCHDOG_CRITICAL_PERCENT:-92}"
ACTIVE_WINDOW_MINUTES="${OPENCLAW_WATCHDOG_ACTIVE_WINDOW_MINUTES:-10}"
STALL_MINUTES="${OPENCLAW_WATCHDOG_STALL_MINUTES:-45}"
TIMEOUT_THRESHOLD="${OPENCLAW_WATCHDOG_TIMEOUT_THRESHOLD:-2}"
PROMPT_COOLDOWN_MINUTES="${OPENCLAW_WATCHDOG_PROMPT_COOLDOWN_MINUTES:-10}"
AUTO_COOLDOWN_MINUTES="${OPENCLAW_WATCHDOG_AUTO_COOLDOWN_MINUTES:-30}"
NOTIFY_LOCAL="${OPENCLAW_WATCHDOG_NOTIFY_LOCAL:-true}"
NOTIFY_TELEGRAM="${OPENCLAW_WATCHDOG_NOTIFY_TELEGRAM:-true}"
ALLOW_CONTAINER_RESTART="${OPENCLAW_WATCHDOG_ALLOW_CONTAINER_RESTART:-true}"

usage() {
  cat <<'EOF'
Usage:
  openclaw-watchdog.sh status
  openclaw-watchdog.sh run-once [--dry-run]
  openclaw-watchdog.sh rotate-session [--dry-run]
  openclaw-watchdog.sh restart-gateway [--dry-run]

Behavior:
  - active conversation: notify context percentage and suggest /compact or /new
  - unattended critical session: rotate to a fresh session automatically
  - Telegram polling stall: restart gateway process first, then container as fallback
EOF
}

command_name="${1:-status}"
shift || true

dry_run="false"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      dry_run="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[watchdog] unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

now_ms() {
  if [[ -n "${OPENCLAW_WATCHDOG_NOW_MS:-}" ]]; then
    printf '%s\n' "$OPENCLAW_WATCHDOG_NOW_MS"
  else
    python3 - <<'PY'
import time
print(int(time.time() * 1000))
PY
  fi
}

json_escape() {
  jq -Rn --arg value "$1" '$value'
}

ensure_state_file() {
  mkdir -p "$(dirname "$STATE_PATH")"
  if [[ ! -f "$STATE_PATH" ]]; then
    printf '%s\n' '{}' > "$STATE_PATH"
  fi
}

state_get_json() {
  local query="$1"
  ensure_state_file
  jq -c "$query" "$STATE_PATH"
}

state_get_scalar() {
  local query="$1"
  ensure_state_file
  jq -r "$query // empty" "$STATE_PATH"
}

state_set() {
  local filter="$1"
  ensure_state_file
  local tmp
  tmp="$(mktemp)"
  jq "$filter" "$STATE_PATH" > "$tmp"
  mv "$tmp" "$STATE_PATH"
}

cooldown_ok() {
  local bucket="$1"
  local key="$2"
  local cooldown_minutes="$3"
  local now
  now="$(now_ms)"
  local last_key
  last_key="$(state_get_scalar ".${bucket}.key")"
  local last_at
  last_at="$(state_get_scalar ".${bucket}.at")"
  if [[ -z "$last_key" || -z "$last_at" ]]; then
    return 0
  fi
  if [[ "$last_key" != "$key" ]]; then
    return 0
  fi
  local cooldown_ms=$(( cooldown_minutes * 60 * 1000 ))
  if (( now - last_at >= cooldown_ms )); then
    return 0
  fi
  return 1
}

record_event() {
  local bucket="$1"
  local key="$2"
  local now
  now="$(now_ms)"
  state_set ".${bucket} = {key: $(json_escape "$key"), at: $now}"
}

load_fixture_text() {
  local name="$1"
  cat "$FIXTURE_DIR/$name"
}

docker_exec_capture() {
  docker exec "$CONTAINER_NAME" sh -lc "$1"
}

load_probe_json() {
  if [[ -n "$FIXTURE_DIR" ]]; then
    load_fixture_text "probe.json"
  else
    docker_exec_capture 'openclaw channels status --probe --json'
  fi
}

load_sessions_summary_json() {
  if [[ -n "$FIXTURE_DIR" ]]; then
    load_fixture_text "sessions-summary.json"
  else
    docker_exec_capture "openclaw sessions --agent $AGENT_ID --json"
  fi
}

load_sessions_store_json() {
  if [[ -n "$FIXTURE_DIR" ]]; then
    load_fixture_text "sessions-store.json"
  else
    docker_exec_capture "cat ~/.openclaw/agents/$AGENT_ID/sessions/sessions.json"
  fi
}

load_logs_text() {
  if [[ -n "$FIXTURE_DIR" ]]; then
    load_fixture_text "logs.txt"
  else
    docker_exec_capture 'latest="$(ls -t /tmp/openclaw/openclaw-*.log 2>/dev/null | head -n 1)"; if [[ -n "$latest" ]]; then tail -n 400 "$latest"; fi'
  fi
}

select_target_session_key() {
  local sessions_summary_json="$1"
  if [[ -n "$SESSION_KEY_OVERRIDE" ]]; then
    printf '%s\n' "$SESSION_KEY_OVERRIDE"
    return
  fi
  jq -r '
    .sessions
    | map(select(.key | contains("telegram:direct:")))
    | sort_by(.updatedAt)
    | last
    | .key // empty
  ' <<< "$sessions_summary_json"
}

compute_snapshot() {
  local probe_json="$1"
  local sessions_summary_json="$2"
  local sessions_store_json="$3"
  local logs_text="$4"
  local target_key="$5"
  local now
  now="$(now_ms)"
  jq -n \
    --argjson probe "$probe_json" \
    --argjson summary "$sessions_summary_json" \
    --argjson store "$sessions_store_json" \
    --arg logs "$logs_text" \
    --arg targetKey "$target_key" \
    --argjson now "$now" \
    --argjson warnPercent "$WARN_PERCENT" \
    --argjson highPercent "$HIGH_PERCENT" \
    --argjson criticalPercent "$CRITICAL_PERCENT" \
    --argjson activeWindowMs "$(( ACTIVE_WINDOW_MINUTES * 60 * 1000 ))" \
    --argjson stallWindowMs "$(( STALL_MINUTES * 60 * 1000 ))" \
    --argjson timeoutThreshold "$TIMEOUT_THRESHOLD" '
    def telegram_account:
      ($probe.channelAccounts.telegram // [])[0] // {};
    def target_summary:
      ($summary.sessions // [] | map(select(.key == $targetKey)) | .[0]) // {};
    def target_store:
      ($store[$targetKey] // {});
    def context_percent:
      if (target_summary.totalTokens | type) == "number" and (target_summary.contextTokens | type) == "number" and target_summary.contextTokens > 0
      then ((target_summary.totalTokens / target_summary.contextTokens) * 100 | floor)
      else null
      end;
    def timeout_count:
      ($logs | split("\n") | map(select(test("LLM request timed out"))) | length);
    def polling_stall:
      ($logs | test("Polling stall detected"));
    def target_chat:
      (target_store.deliveryContext.to // target_store.origin.from // "") as $raw
      | (try ($raw | capture("telegram:(?<id>.+)$").id) catch "");

    {
      nowMs: $now,
      telegram: {
        running: (telegram_account.running // false),
        probeOk: (telegram_account.probe.ok // false),
        lastInboundAt: telegram_account.lastInboundAt,
        lastOutboundAt: telegram_account.lastOutboundAt
      },
      session: {
        key: $targetKey,
        sessionId: target_summary.sessionId,
        sessionFile: target_store.sessionFile,
        updatedAt: target_summary.updatedAt,
        compactionCount: (target_summary.compactionCount // target_store.compactionCount // 0),
        totalTokens: target_summary.totalTokens,
        contextTokens: target_summary.contextTokens,
        ageMs: (if (target_summary.updatedAt | type) == "number" then ($now - target_summary.updatedAt) else null end),
        chatId: target_chat,
        accountId: (target_store.deliveryContext.accountId // "default")
      },
      context: {
        percent: context_percent
      },
      signals: {
        timeoutCount: timeout_count,
        pollingStallDetected: polling_stall,
        activeConversation: (
          (target_summary.updatedAt | type) == "number"
          and ($now - target_summary.updatedAt) <= $activeWindowMs
          and (telegram_account.lastInboundAt | type) == "number"
          and ($now - telegram_account.lastInboundAt) <= $activeWindowMs
        ),
        unattended: (
          ((target_summary.updatedAt | type) != "number") or (($now - target_summary.updatedAt) > $activeWindowMs)
        ),
        telegramStalled: (
          (telegram_account.probe.ok // false)
          and (telegram_account.lastInboundAt | type) == "number"
          and (($now - telegram_account.lastInboundAt) >= $stallWindowMs)
        )
      },
      thresholds: {
        warnPercent: $warnPercent,
        highPercent: $highPercent,
        criticalPercent: $criticalPercent,
        timeoutThreshold: $timeoutThreshold
      }
    }
    | .decision = (
      if (.signals.telegramStalled or .signals.pollingStallDetected) then
        {
          mode: "auto_recover",
          suggestedAction: "restart_gateway",
          reason: "telegram_stalled"
        }
      elif (.signals.activeConversation and (.context.percent != null) and (.context.percent >= .thresholds.warnPercent)) then
        {
          mode: "manual_prompt",
          suggestedAction:
            (if (.context.percent >= .thresholds.criticalPercent) or (.signals.timeoutCount >= .thresholds.timeoutThreshold) or (.session.compactionCount >= 1 and .context.percent >= .thresholds.highPercent)
             then "new"
             else "compact"
             end),
          reason:
            (if (.signals.timeoutCount >= .thresholds.timeoutThreshold) then "timeouts"
             elif (.context.percent >= .thresholds.criticalPercent) then "context_critical"
             else "context_high"
             end)
        }
      elif (.signals.unattended and (((.context.percent != null) and (.context.percent >= .thresholds.criticalPercent)) or (.signals.timeoutCount >= .thresholds.timeoutThreshold))) then
        {
          mode: "auto_recover",
          suggestedAction: "new_session",
          reason:
            (if (.signals.timeoutCount >= .thresholds.timeoutThreshold) then "timeouts"
             else "context_critical"
             end)
        }
      else
        {
          mode: "noop",
          suggestedAction: "none",
          reason: "healthy"
        }
      end
    )
  '
}

notify_local() {
  local title="$1"
  local body="$2"
  [[ "$NOTIFY_LOCAL" == "true" ]] || return 0
  [[ -z "$FIXTURE_DIR" ]] || return 0
  [[ "$(uname -s)" == "Darwin" ]] || return 0
  command -v osascript >/dev/null 2>&1 || return 0
  osascript - "$title" "$body" >/dev/null 2>&1 <<'OSA' || true
on run argv
  display notification (item 2 of argv) with title (item 1 of argv)
end run
OSA
}

notify_telegram() {
  local chat_id="$1"
  local account_id="$2"
  local message="$3"
  [[ "$NOTIFY_TELEGRAM" == "true" ]] || return 0
  [[ -z "$FIXTURE_DIR" ]] || return 0
  [[ -n "$chat_id" ]] || return 0
  docker_exec_capture "openclaw message send --channel telegram --account $account_id --target $chat_id --message $(printf '%q' "$message") --silent --json >/dev/null"
}

rotate_session_live() {
  local target_key="$1"
  local session_file="$2"
  local store_path="~/.openclaw/agents/$AGENT_ID/sessions/sessions.json"
  local backup_suffix
  backup_suffix="$(TZ=UTC date +%Y-%m-%dT%H-%M-%S.%3NZ 2>/dev/null || date +%Y-%m-%dT%H-%M-%SZ)"
  if [[ -n "$session_file" ]]; then
    docker_exec_capture "[[ -f \"$session_file\" ]] && mv \"$session_file\" \"$session_file.reset.$backup_suffix\" || true"
  fi
  local tmp_store tmp_next
  tmp_store="$(mktemp)"
  tmp_next="$(mktemp)"
  docker_exec_capture "cat $store_path" > "$tmp_store"
  jq --arg key "$target_key" 'del(.[$key])' "$tmp_store" > "$tmp_next"
  docker exec -i "$CONTAINER_NAME" sh -lc "cat > /home/node/.openclaw/agents/$AGENT_ID/sessions/sessions.json" < "$tmp_next"
  rm -f "$tmp_store" "$tmp_next"
}

rotate_session_fixture() {
  local target_key="$1"
  local session_file="$2"
  local backup_suffix="fixture.$(now_ms)"
  if [[ -n "$session_file" && -f "$session_file" ]]; then
    mv "$session_file" "$session_file.reset.$backup_suffix"
  fi
  local tmp_next
  tmp_next="$(mktemp)"
  jq --arg key "$target_key" 'del(.[$key])' "$FIXTURE_DIR/sessions-store.json" > "$tmp_next"
  mv "$tmp_next" "$FIXTURE_DIR/sessions-store.json"
}

rotate_session() {
  local target_key="$1"
  local session_file="$2"
  if [[ "$dry_run" == "true" ]]; then
    return 0
  fi
  if [[ -n "$FIXTURE_DIR" ]]; then
    rotate_session_fixture "$target_key" "$session_file"
  else
    rotate_session_live "$target_key" "$session_file"
  fi
}

restart_gateway_live() {
  if docker_exec_capture 'if pgrep -x openclaw-gateway >/dev/null 2>&1; then pkill -x openclaw-gateway; sleep 2; fi; nohup openclaw gateway run --allow-unconfigured > "$HOME/.openclaw/gateway.log" 2>&1 & for i in $(seq 1 15); do if openclaw gateway health >/dev/null 2>&1; then exit 0; fi; sleep 1; done; exit 1'; then
    return 0
  fi
  if [[ "$ALLOW_CONTAINER_RESTART" == "true" ]]; then
    docker restart "$CONTAINER_NAME" >/dev/null
    sleep 3
    docker_exec_capture 'openclaw gateway health >/dev/null 2>&1'
    return $?
  fi
  return 1
}

restart_gateway() {
  if [[ "$dry_run" == "true" ]]; then
    return 0
  fi
  if [[ -n "$FIXTURE_DIR" ]]; then
    return 0
  fi
  restart_gateway_live
}

render_manual_message() {
  local snapshot_json="$1"
  jq -r '
    if .decision.suggestedAction == "compact" then
      "⚠️ 当前会话上下文已到 " + (.context.percent|tostring) + "%，建议在当前对话中发送 /compact。"
    else
      "⚠️ 当前会话上下文已到 " + (.context.percent|tostring) + "%，建议在当前对话中发送 /new。"
    end
  ' <<< "$snapshot_json"
}

render_auto_message() {
  local snapshot_json="$1"
  jq -r '
    if .decision.appliedAction == "restart_gateway" then
      "⚙️ Watchdog 已自动重启 OpenClaw gateway：原因=Telegram 轮询卡住。"
    elif .decision.appliedAction == "new_session" then
      "⚙️ Watchdog 已自动切到新会话：原因=" + .decision.reason + "。下条消息将从新 session 开始。"
    else
      "⚙️ Watchdog 已执行自动恢复。"
    end
  ' <<< "$snapshot_json"
}

run_status() {
  local probe_json sessions_summary_json sessions_store_json logs_text target_key snapshot_json
  probe_json="$(load_probe_json)"
  sessions_summary_json="$(load_sessions_summary_json)"
  sessions_store_json="$(load_sessions_store_json)"
  logs_text="$(load_logs_text)"
  target_key="$(select_target_session_key "$sessions_summary_json")"
  snapshot_json="$(compute_snapshot "$probe_json" "$sessions_summary_json" "$sessions_store_json" "$logs_text" "$target_key")"
  printf '%s\n' "$snapshot_json"
}

run_once() {
  local snapshot_json
  snapshot_json="$(run_status)"
  local decision_mode
  decision_mode="$(jq -r '.decision.mode' <<< "$snapshot_json")"
  local suggested_action
  suggested_action="$(jq -r '.decision.suggestedAction' <<< "$snapshot_json")"
  local target_key session_file chat_id account_id event_key
  target_key="$(jq -r '.session.key // empty' <<< "$snapshot_json")"
  session_file="$(jq -r '.session.sessionFile // empty' <<< "$snapshot_json")"
  chat_id="$(jq -r '.session.chatId // empty' <<< "$snapshot_json")"
  account_id="$(jq -r '.session.accountId // "default"' <<< "$snapshot_json")"

  if [[ "$decision_mode" == "manual_prompt" ]]; then
    event_key="$(jq -r '.decision.reason + ":" + (.context.percent|tostring)' <<< "$snapshot_json")"
    if cooldown_ok "manualPrompt" "$event_key" "$PROMPT_COOLDOWN_MINUTES"; then
      local message
      message="$(render_manual_message "$snapshot_json")"
      notify_local "OpenClaw Context" "$message"
      notify_telegram "$chat_id" "$account_id" "$message"
      record_event "manualPrompt" "$event_key"
      snapshot_json="$(jq '.decision.notified = true' <<< "$snapshot_json")"
    else
      snapshot_json="$(jq '.decision.notified = false' <<< "$snapshot_json")"
    fi
    printf '%s\n' "$snapshot_json"
    return 0
  fi

  if [[ "$decision_mode" != "auto_recover" ]]; then
    snapshot_json="$(jq '.decision.executed = false | .decision.appliedAction = "none" | .decision.notified = false' <<< "$snapshot_json")"
    printf '%s\n' "$snapshot_json"
    return 0
  fi

  event_key="$(jq -r '.decision.reason + ":" + .decision.suggestedAction' <<< "$snapshot_json")"
  if ! cooldown_ok "autoRecover" "$event_key" "$AUTO_COOLDOWN_MINUTES"; then
    snapshot_json="$(jq '.decision.executed = false | .decision.appliedAction = "cooldown_skip" | .decision.notified = false' <<< "$snapshot_json")"
    printf '%s\n' "$snapshot_json"
    return 0
  fi

  local executed="false"
  local applied_action="$suggested_action"
  if [[ "$suggested_action" == "new_session" ]]; then
    rotate_session "$target_key" "$session_file"
    executed="$([[ "$dry_run" == "true" ]] && printf false || printf true)"
  elif [[ "$suggested_action" == "restart_gateway" ]]; then
    restart_gateway
    executed="$([[ "$dry_run" == "true" ]] && printf false || printf true)"
  fi

  record_event "autoRecover" "$event_key"
  snapshot_json="$(
    jq \
      --arg appliedAction "$applied_action" \
      --argjson executed "$executed" \
      '.decision.appliedAction = $appliedAction | .decision.executed = $executed' <<< "$snapshot_json"
  )"

  local auto_message
  auto_message="$(render_auto_message "$snapshot_json")"
  notify_local "OpenClaw Recovery" "$auto_message"
  notify_telegram "$chat_id" "$account_id" "$auto_message"
  snapshot_json="$(jq '.decision.notified = true' <<< "$snapshot_json")"
  printf '%s\n' "$snapshot_json"
}

run_rotate_session_command() {
  local snapshot_json target_key session_file
  snapshot_json="$(run_status)"
  target_key="$(jq -r '.session.key // empty' <<< "$snapshot_json")"
  session_file="$(jq -r '.session.sessionFile // empty' <<< "$snapshot_json")"
  rotate_session "$target_key" "$session_file"
  jq --argjson executed "$([[ "$dry_run" == "true" ]] && printf false || printf true)" \
    '.decision = {mode:"manual", suggestedAction:"new_session", appliedAction:"new_session", executed:$executed}' <<< "$snapshot_json"
}

run_restart_gateway_command() {
  local snapshot_json
  snapshot_json="$(run_status)"
  restart_gateway
  jq --argjson executed "$([[ "$dry_run" == "true" ]] && printf false || printf true)" \
    '.decision = {mode:"manual", suggestedAction:"restart_gateway", appliedAction:"restart_gateway", executed:$executed}' <<< "$snapshot_json"
}

case "$command_name" in
  status)
    run_status
    ;;
  run-once)
    run_once
    ;;
  rotate-session)
    run_rotate_session_command
    ;;
  restart-gateway)
    run_restart_gateway_command
    ;;
  *)
    echo "[watchdog] unknown command: $command_name" >&2
    usage >&2
    exit 1
    ;;
esac
