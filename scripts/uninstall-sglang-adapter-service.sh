#!/usr/bin/env bash
set -euo pipefail

LABEL="${SGLANG_ADAPTER_LABEL:-ai.openclaw.sglang-adapter}"
LAUNCH_AGENTS_DIR="${SGLANG_ADAPTER_LAUNCH_AGENTS_DIR:-$HOME/Library/LaunchAgents}"
PLIST_PATH="$LAUNCH_AGENTS_DIR/${LABEL}.plist"
SKIP_LAUNCHCTL="${OPENCLAW_SKIP_LAUNCHCTL:-0}"

usage() {
  cat <<'EOF'
Usage:
  bash scripts/uninstall-sglang-adapter-service.sh

Environment overrides:
  SGLANG_ADAPTER_LABEL
  SGLANG_ADAPTER_LAUNCH_AGENTS_DIR
  OPENCLAW_SKIP_LAUNCHCTL=1
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ "$SKIP_LAUNCHCTL" != "1" ]]; then
  launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
fi

rm -f "$PLIST_PATH"
echo "[uninstall-sglang-adapter] removed: $PLIST_PATH"
