#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${OPENCLAW_ENV_FILE:-$ROOT_DIR/.env.local}"
TEMPLATE_PATH="${AI_NEWS_PROMPT_TEMPLATE:-$ROOT_DIR/scripts/ai-news-daily-prompt.template.md}"
JOB_NAME="${AI_NEWS_JOB_NAME:-ai-news-daily}"
JOB_ID_FILE="${AI_NEWS_JOB_ID_FILE:-$HOME/.openclaw/ai-news-daily.jobid}"
DRY_RUN=false

usage() {
  cat <<USAGE
Usage: $(basename "$0") [--dry-run] [--env-file PATH] [--job-name NAME]
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      ;;
    --env-file)
      ENV_FILE="$2"
      shift
      ;;
    --job-name)
      JOB_NAME="$2"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[setup-ai-news-daily] unknown arg: $1" >&2
      usage
      exit 1
      ;;
  esac
  shift
done

[[ -f "$ENV_FILE" ]] || { echo "[setup-ai-news-daily] env file not found: $ENV_FILE" >&2; exit 1; }
[[ -f "$TEMPLATE_PATH" ]] || { echo "[setup-ai-news-daily] template not found: $TEMPLATE_PATH" >&2; exit 1; }
command -v openclaw >/dev/null || { echo "[setup-ai-news-daily] openclaw not found" >&2; exit 1; }
command -v jq >/dev/null || { echo "[setup-ai-news-daily] jq not found" >&2; exit 1; }

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${AI_NEWS_OBSIDIAN_DIR:=/Users/dysania/program/documents/obsidian_vault/news/daily}"
: "${AI_NEWS_AGENT_ID:=main}"
: "${AI_NEWS_TZ:=Asia/Shanghai}"
: "${AI_NEWS_CRON:=30 8 * * *}"
: "${AI_NEWS_LOOKBACK_HOURS:=24}"
: "${AI_NEWS_FALLBACK_HOURS:=48}"
: "${AI_NEWS_TOP_N:=10}"
: "${AI_NEWS_PICK_N:=3}"

require_non_empty() {
  local key="$1"
  local value="$2"
  if [[ -z "${value// }" ]]; then
    echo "[setup-ai-news-daily] missing required value: $key" >&2
    exit 1
  fi
}

require_non_empty "AI_NEWS_TELEGRAM_TARGET" "${AI_NEWS_TELEGRAM_TARGET:-}"
require_non_empty "AI_NEWS_AGENT_ID" "$AI_NEWS_AGENT_ID"
require_non_empty "AI_NEWS_CRON" "$AI_NEWS_CRON"
require_non_empty "AI_NEWS_TZ" "$AI_NEWS_TZ"

if [[ "${AI_NEWS_TELEGRAM_TARGET}" == "TODO_SET_CHAT_ID" ]]; then
  echo "[setup-ai-news-daily] AI_NEWS_TELEGRAM_TARGET is placeholder, set real chat id/username" >&2
  exit 1
fi

mkdir -p "$AI_NEWS_OBSIDIAN_DIR"

if command -v envsubst >/dev/null; then
  RENDERED_MESSAGE="$(envsubst < "$TEMPLATE_PATH")"
else
  echo "[setup-ai-news-daily] envsubst not found; using bash substitutions" >&2
  RENDERED_MESSAGE="$(cat "$TEMPLATE_PATH")"
  RENDERED_MESSAGE="${RENDERED_MESSAGE//'${AI_NEWS_OBSIDIAN_DIR}'/$AI_NEWS_OBSIDIAN_DIR}"
  RENDERED_MESSAGE="${RENDERED_MESSAGE//'${AI_NEWS_TELEGRAM_TARGET}'/$AI_NEWS_TELEGRAM_TARGET}"
  RENDERED_MESSAGE="${RENDERED_MESSAGE//'${AI_NEWS_AGENT_ID}'/$AI_NEWS_AGENT_ID}"
  RENDERED_MESSAGE="${RENDERED_MESSAGE//'${AI_NEWS_TZ}'/$AI_NEWS_TZ}"
  RENDERED_MESSAGE="${RENDERED_MESSAGE//'${AI_NEWS_LOOKBACK_HOURS}'/$AI_NEWS_LOOKBACK_HOURS}"
  RENDERED_MESSAGE="${RENDERED_MESSAGE//'${AI_NEWS_FALLBACK_HOURS}'/$AI_NEWS_FALLBACK_HOURS}"
  RENDERED_MESSAGE="${RENDERED_MESSAGE//'${AI_NEWS_TOP_N}'/$AI_NEWS_TOP_N}"
  RENDERED_MESSAGE="${RENDERED_MESSAGE//'${AI_NEWS_PICK_N}'/$AI_NEWS_PICK_N}"
fi

if $DRY_RUN; then
  echo "[setup-ai-news-daily] dry-run mode"
  echo "  env_file=$ENV_FILE"
  echo "  job_name=$JOB_NAME"
  echo "  agent_id=$AI_NEWS_AGENT_ID"
  echo "  cron=$AI_NEWS_CRON"
  echo "  tz=$AI_NEWS_TZ"
  echo "  obsidian_dir=$AI_NEWS_OBSIDIAN_DIR"
  echo "  telegram_target=$AI_NEWS_TELEGRAM_TARGET"
  exit 0
fi

existing_id="$(openclaw cron list --json | jq -r --arg name "$JOB_NAME" '.jobs[]? | select(.name==$name) | .id' | head -n1)"

if [[ -n "$existing_id" ]]; then
  openclaw cron edit "$existing_id" \
    --name "$JOB_NAME" \
    --agent "$AI_NEWS_AGENT_ID" \
    --session isolated \
    --cron "$AI_NEWS_CRON" \
    --tz "$AI_NEWS_TZ" \
    --message "$RENDERED_MESSAGE" >/dev/null
  job_id="$existing_id"
  action="updated"
else
  openclaw cron add \
    --name "$JOB_NAME" \
    --agent "$AI_NEWS_AGENT_ID" \
    --session isolated \
    --cron "$AI_NEWS_CRON" \
    --tz "$AI_NEWS_TZ" \
    --message "$RENDERED_MESSAGE" \
    --json >/dev/null
  action="created"
fi

job_id="$(openclaw cron list --json | jq -r --arg name "$JOB_NAME" '.jobs[]? | select(.name==$name) | .id' | head -n1)"

[[ -n "$job_id" ]] || { echo "[setup-ai-news-daily] failed to resolve job id" >&2; exit 1; }

mkdir -p "$(dirname "$JOB_ID_FILE")"
printf '%s\n' "$job_id" > "$JOB_ID_FILE"

echo "[setup-ai-news-daily] $action cron job: $JOB_NAME"
echo "[setup-ai-news-daily] job id saved: $JOB_ID_FILE"
