#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE_PATH="${SGLANG_ADAPTER_TEMPLATE_PATH:-$ROOT_DIR/templates/launchd/ai.openclaw.sglang-adapter.plist.template}"
LABEL="${SGLANG_ADAPTER_LABEL:-ai.openclaw.sglang-adapter}"
LAUNCH_AGENTS_DIR="${SGLANG_ADAPTER_LAUNCH_AGENTS_DIR:-$HOME/Library/LaunchAgents}"
PLIST_PATH="$LAUNCH_AGENTS_DIR/${LABEL}.plist"
NODE_PATH="${SGLANG_ADAPTER_NODE_PATH:-$(command -v node || true)}"
WORKDIR="${SGLANG_ADAPTER_WORKDIR:-$ROOT_DIR}"
SCRIPT_PATH="${SGLANG_ADAPTER_SCRIPT_PATH:-$WORKDIR/scripts/sglang-toolcall-adapter.mjs}"
UPSTREAM_BASE_URL="${SGLANG_UPSTREAM_BASE_URL:-http://127.0.0.1:30000/v1}"
ADAPTER_HOST="${SGLANG_ADAPTER_HOST:-127.0.0.1}"
ADAPTER_PORT="${SGLANG_ADAPTER_PORT:-31001}"
STREAM_MODE="${SGLANG_ADAPTER_STREAM_MODE:-proxy}"
STREAM_FALLBACK="${SGLANG_ADAPTER_STREAM_FALLBACK:-on}"
STDOUT_PATH="${SGLANG_ADAPTER_STDOUT_PATH:-/tmp/openclaw/sglang-adapter.log}"
STDERR_PATH="${SGLANG_ADAPTER_STDERR_PATH:-/tmp/openclaw/sglang-adapter.err.log}"
SKIP_LAUNCHCTL="${OPENCLAW_SKIP_LAUNCHCTL:-0}"

usage() {
  cat <<'EOF'
Usage:
  bash scripts/install-sglang-adapter-service.sh

Environment overrides:
  SGLANG_UPSTREAM_BASE_URL
  SGLANG_ADAPTER_HOST
  SGLANG_ADAPTER_PORT
  SGLANG_ADAPTER_STREAM_MODE
  SGLANG_ADAPTER_STREAM_FALLBACK
  SGLANG_ADAPTER_WORKDIR
  SGLANG_ADAPTER_LAUNCH_AGENTS_DIR
  OPENCLAW_SKIP_LAUNCHCTL=1
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

[[ -f "$TEMPLATE_PATH" ]] || { echo "[install-sglang-adapter] template not found: $TEMPLATE_PATH" >&2; exit 1; }
[[ -n "$NODE_PATH" ]] || { echo "[install-sglang-adapter] node not found" >&2; exit 1; }
[[ -f "$SCRIPT_PATH" ]] || { echo "[install-sglang-adapter] adapter script not found: $SCRIPT_PATH" >&2; exit 1; }
[[ -d "$WORKDIR" ]] || { echo "[install-sglang-adapter] workdir not found: $WORKDIR" >&2; exit 1; }

mkdir -p "$LAUNCH_AGENTS_DIR" "$(dirname "$STDOUT_PATH")" "$(dirname "$STDERR_PATH")"

NODE_PATH="$NODE_PATH" \
SCRIPT_PATH="$SCRIPT_PATH" \
UPSTREAM_BASE_URL="$UPSTREAM_BASE_URL" \
ADAPTER_HOST="$ADAPTER_HOST" \
ADAPTER_PORT="$ADAPTER_PORT" \
STREAM_MODE="$STREAM_MODE" \
STREAM_FALLBACK="$STREAM_FALLBACK" \
WORKDIR="$WORKDIR" \
STDOUT_PATH="$STDOUT_PATH" \
STDERR_PATH="$STDERR_PATH" \
python3 - "$TEMPLATE_PATH" "$PLIST_PATH" <<'PY'
import os
import pathlib
import sys

template_path = pathlib.Path(sys.argv[1])
output_path = pathlib.Path(sys.argv[2])
template = template_path.read_text(encoding="utf-8")
replacements = {
    "__NODE_PATH__": os.environ["NODE_PATH"],
    "__SCRIPT_PATH__": os.environ["SCRIPT_PATH"],
    "__UPSTREAM_BASE_URL__": os.environ["UPSTREAM_BASE_URL"],
    "__ADAPTER_HOST__": os.environ["ADAPTER_HOST"],
    "__ADAPTER_PORT__": os.environ["ADAPTER_PORT"],
    "__STREAM_MODE__": os.environ["STREAM_MODE"],
    "__STREAM_FALLBACK__": os.environ["STREAM_FALLBACK"],
    "__WORKDIR__": os.environ["WORKDIR"],
    "__STDOUT_PATH__": os.environ["STDOUT_PATH"],
    "__STDERR_PATH__": os.environ["STDERR_PATH"],
}
for key, value in replacements.items():
    template = template.replace(key, value)
output_path.write_text(template, encoding="utf-8")
PY

plutil -lint "$PLIST_PATH" >/dev/null

if [[ "$SKIP_LAUNCHCTL" != "1" ]]; then
  launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
  launchctl bootstrap "gui/$UID" "$PLIST_PATH"
  launchctl kickstart -k "gui/$UID/$LABEL"
fi

echo "[install-sglang-adapter] plist ready: $PLIST_PATH"
