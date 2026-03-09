#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE_DIR="${1:-${OPENCLAW_WORKSPACE_DIR:-$HOME/.openclaw/workspace}}"
TARGET_FILE="$WORKSPACE_DIR/AGENTS.md"
SNIPPET_FILE="$ROOT_DIR/config/workspace/agents.execution-guard.md"
BEGIN_MARKER="<!-- OPENCLAW_EXECUTION_GUARD:BEGIN -->"
END_MARKER="<!-- OPENCLAW_EXECUTION_GUARD:END -->"

[[ -f "$SNIPPET_FILE" ]] || {
  echo "[sync-workspace-guards] missing snippet: $SNIPPET_FILE" >&2
  exit 1
}

mkdir -p "$WORKSPACE_DIR"

if [[ ! -f "$TARGET_FILE" ]]; then
  cat > "$TARGET_FILE" <<'EOF'
# AGENTS.md - Your Workspace
EOF
fi

stripped_file="$(mktemp)"
output_file="$(mktemp)"
trap 'rm -f "$stripped_file" "$output_file"' EXIT

awk -v begin="$BEGIN_MARKER" -v end="$END_MARKER" '
  $0 == begin { skip = 1; next }
  $0 == end { skip = 0; next }
  skip != 1 { print }
' "$TARGET_FILE" > "$stripped_file"

perl -0pi -e 's/\s*\z/\n\n/s' "$stripped_file"

{
  cat "$stripped_file"
  echo "$BEGIN_MARKER"
  cat "$SNIPPET_FILE"
  echo "$END_MARKER"
  echo
} > "$output_file"

mv "$output_file" "$TARGET_FILE"
echo "[sync-workspace-guards] updated $TARGET_FILE"
