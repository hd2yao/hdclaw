#!/usr/bin/env bash
set -euo pipefail

WORKSPACE_DIR="${OPENCLAW_WORKSPACE_DIR:-$HOME/.openclaw/workspace}"
TASK_FILE="$WORKSPACE_DIR/memory/active-task.json"

usage() {
  cat <<'EOF'
Usage:
  openclaw-active-task.sh status
  openclaw-active-task.sh set --task "<task>" --cwd "<cwd>" --next "<next step>"
  openclaw-active-task.sh clear
EOF
}

emit_idle() {
  jq -n '{status:"idle"}'
}

command_name="${1:-status}"
if [[ $# -gt 0 ]]; then
  shift
fi

case "$command_name" in
  status)
    if [[ -f "$TASK_FILE" ]]; then
      cat "$TASK_FILE"
    else
      emit_idle
    fi
    ;;
  set)
    task=""
    cwd=""
    next=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --task)
          task="${2:-}"
          shift 2
          ;;
        --cwd)
          cwd="${2:-}"
          shift 2
          ;;
        --next)
          next="${2:-}"
          shift 2
          ;;
        *)
          echo "[active-task] unknown argument: $1" >&2
          usage >&2
          exit 1
          ;;
      esac
    done

    if [[ -z "$task" || -z "$cwd" || -z "$next" ]]; then
      echo "[active-task] --task, --cwd, and --next are required" >&2
      usage >&2
      exit 1
    fi

    mkdir -p "$(dirname "$TASK_FILE")"
    jq -n \
      --arg task "$task" \
      --arg cwd "$cwd" \
      --arg next "$next" \
      --arg updatedAt "$(TZ=Asia/Shanghai date -Iseconds)" \
      '{
        status: "active",
        task: $task,
        cwd: $cwd,
        next: $next,
        updatedAt: $updatedAt
      }' > "$TASK_FILE"
    cat "$TASK_FILE"
    ;;
  clear)
    rm -f "$TASK_FILE"
    emit_idle
    ;;
  *)
    echo "[active-task] unknown command: $command_name" >&2
    usage >&2
    exit 1
    ;;
esac
