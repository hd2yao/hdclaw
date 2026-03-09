#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT_PATH="$ROOT_DIR/scripts/openclaw-active-task.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

WORKSPACE_DIR="$TMP_DIR/workspace"
mkdir -p "$WORKSPACE_DIR"

echo "[test-active-task] expecting helper script at $SCRIPT_PATH"
[[ -x "$SCRIPT_PATH" ]] || {
  echo "[test-active-task] missing executable script: $SCRIPT_PATH" >&2
  exit 1
}

status_empty="$(OPENCLAW_WORKSPACE_DIR="$WORKSPACE_DIR" bash "$SCRIPT_PATH" status)"
echo "$status_empty" | jq -e '.status == "idle"' >/dev/null || {
  echo "[test-active-task] expected idle status before task is set" >&2
  exit 1
}

OPENCLAW_WORKSPACE_DIR="$WORKSPACE_DIR" bash "$SCRIPT_PATH" set \
  --task "optimize ai-news pipeline" \
  --cwd "/Users/dysania/program/openclaw" \
  --next "create failing test for continuation trigger" >/dev/null

status_running="$(OPENCLAW_WORKSPACE_DIR="$WORKSPACE_DIR" bash "$SCRIPT_PATH" status)"
echo "$status_running" | jq -e '.status == "active"' >/dev/null || {
  echo "[test-active-task] expected active status after set" >&2
  exit 1
}

echo "$status_running" | jq -e '.task == "optimize ai-news pipeline"' >/dev/null || {
  echo "[test-active-task] expected task title to persist" >&2
  exit 1
}

echo "$status_running" | jq -e '.next == "create failing test for continuation trigger"' >/dev/null || {
  echo "[test-active-task] expected next step to persist" >&2
  exit 1
}

OPENCLAW_WORKSPACE_DIR="$WORKSPACE_DIR" bash "$SCRIPT_PATH" clear >/dev/null

status_cleared="$(OPENCLAW_WORKSPACE_DIR="$WORKSPACE_DIR" bash "$SCRIPT_PATH" status)"
echo "$status_cleared" | jq -e '.status == "idle"' >/dev/null || {
  echo "[test-active-task] expected idle status after clear" >&2
  exit 1
}

echo "[test-active-task] passed"
