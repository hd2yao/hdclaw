#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT_PATH="$ROOT_DIR/scripts/sync-workspace-guards.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

WORKSPACE_DIR="$TMP_DIR/workspace"
mkdir -p "$WORKSPACE_DIR"

cat > "$WORKSPACE_DIR/AGENTS.md" <<'EOF'
# AGENTS.md - Your Workspace

## Execution Contract (Hard)

- If the user asks for an actionable task that tools can do now, execute tools in the same turn before sending the final reply.
EOF

echo "[test-workspace-guards] expecting installer at $SCRIPT_PATH"
[[ -x "$SCRIPT_PATH" ]] || {
  echo "[test-workspace-guards] missing executable script: $SCRIPT_PATH" >&2
  exit 1
}

bash "$SCRIPT_PATH" "$WORKSPACE_DIR" >/dev/null

grep -q "OPENCLAW_EXECUTION_GUARD:BEGIN" "$WORKSPACE_DIR/AGENTS.md" || {
  echo "[test-workspace-guards] expected managed guard block markers" >&2
  exit 1
}

grep -q "继续执行" "$WORKSPACE_DIR/AGENTS.md" || {
  echo "[test-workspace-guards] expected continuation trigger phrase" >&2
  exit 1
}

grep -q "openclaw-active-task.sh status" "$WORKSPACE_DIR/AGENTS.md" || {
  echo "[test-workspace-guards] expected active-task helper reference" >&2
  exit 1
}

before="$(shasum "$WORKSPACE_DIR/AGENTS.md" | awk '{print $1}')"
bash "$SCRIPT_PATH" "$WORKSPACE_DIR" >/dev/null
after="$(shasum "$WORKSPACE_DIR/AGENTS.md" | awk '{print $1}')"

if [[ "$before" != "$after" ]]; then
  echo "[test-workspace-guards] expected idempotent sync" >&2
  exit 1
fi

echo "[test-workspace-guards] passed"
