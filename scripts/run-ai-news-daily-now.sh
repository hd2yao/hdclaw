#!/usr/bin/env bash
set -euo pipefail

JOB_NAME="${AI_NEWS_JOB_NAME:-ai-news-daily}"
JOB_ID_FILE="${AI_NEWS_JOB_ID_FILE:-$HOME/.openclaw/ai-news-daily.jobid}"
RUN_TIMEOUT_MS="${AI_NEWS_RUN_TIMEOUT_MS:-900000}"
JOB_ID=""

usage() {
  cat <<USAGE
Usage: $(basename "$0") [--job-id ID] [--job-name NAME]
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --job-id)
      JOB_ID="$2"
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
      echo "[run-ai-news-daily-now] unknown arg: $1" >&2
      usage
      exit 1
      ;;
  esac
  shift
done

command -v openclaw >/dev/null || { echo "[run-ai-news-daily-now] openclaw not found" >&2; exit 1; }
command -v jq >/dev/null || { echo "[run-ai-news-daily-now] jq not found" >&2; exit 1; }

if [[ -z "$JOB_ID" && -f "$JOB_ID_FILE" ]]; then
  JOB_ID="$(tr -d '[:space:]' < "$JOB_ID_FILE")"
fi

if [[ -z "$JOB_ID" ]]; then
  JOB_ID="$(openclaw cron list --json | jq -r --arg name "$JOB_NAME" '.jobs[]? | select(.name==$name) | .id' | head -n1)"
  if [[ -n "$JOB_ID" ]]; then
    mkdir -p "$(dirname "$JOB_ID_FILE")"
    printf '%s\n' "$JOB_ID" > "$JOB_ID_FILE"
    echo "[run-ai-news-daily-now] recovered job id and wrote $JOB_ID_FILE"
  fi
fi

[[ -n "$JOB_ID" ]] || {
  echo "[run-ai-news-daily-now] cannot resolve job id for job name: $JOB_NAME" >&2
  exit 1
}

echo "[run-ai-news-daily-now] running job: $JOB_ID"
openclaw cron run "$JOB_ID" --expect-final --timeout "$RUN_TIMEOUT_MS"

echo "[run-ai-news-daily-now] latest runs"
openclaw cron runs --id "$JOB_ID" --limit 3
