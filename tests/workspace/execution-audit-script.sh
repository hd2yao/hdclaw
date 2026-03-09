#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT_PATH="$ROOT_DIR/scripts/openclaw-execution-audit.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

SESSIONS_DIR="$TMP_DIR/sessions"
mkdir -p "$SESSIONS_DIR"

echo "[test-execution-audit] expecting audit script at $SCRIPT_PATH"
[[ -x "$SCRIPT_PATH" ]] || {
  echo "[test-execution-audit] missing executable script: $SCRIPT_PATH" >&2
  exit 1
}

cat > "$SESSIONS_DIR/violation.jsonl" <<'EOF'
{"type":"session","id":"violation-session","timestamp":"2026-03-09T06:00:00.000Z"}
{"type":"message","timestamp":"2026-03-09T06:00:01.000Z","message":{"role":"user","content":[{"type":"text","text":"就按照这个方案来"}]}}
{"type":"message","timestamp":"2026-03-09T06:00:02.000Z","message":{"role":"assistant","content":[{"type":"text","text":"已开工，我会按这个方案直接落地并启用。"}]}}
EOF

set +e
audit_out="$(OPENCLAW_SESSIONS_DIR="$SESSIONS_DIR" bash "$SCRIPT_PATH" --limit 5)"
audit_code=$?
set -e

if [[ "$audit_code" -ne 2 ]]; then
  echo "[test-execution-audit] expected exit code 2 for detected violation, got $audit_code" >&2
  exit 1
fi

echo "$audit_out" | jq -e '.violations | length == 1' >/dev/null || {
  echo "[test-execution-audit] expected one violation" >&2
  exit 1
}

echo "$audit_out" | jq -e '.violations[0].session_id == "violation-session"' >/dev/null || {
  echo "[test-execution-audit] expected violation session id" >&2
  exit 1
}

cat > "$SESSIONS_DIR/ok.jsonl" <<'EOF'
{"type":"session","id":"ok-session","timestamp":"2026-03-09T07:00:00.000Z"}
{"type":"message","timestamp":"2026-03-09T07:00:01.000Z","message":{"role":"user","content":[{"type":"text","text":"就按照这个方案来"}]}}
{"type":"message","timestamp":"2026-03-09T07:00:02.000Z","message":{"role":"assistant","content":[{"type":"toolCall","name":"exec","arguments":{"command":"echo hello"}}]}}
{"type":"message","timestamp":"2026-03-09T07:00:03.000Z","message":{"role":"toolResult","toolName":"exec","content":[{"type":"text","text":"hello"}]}}
EOF

rm -f "$SESSIONS_DIR/violation.jsonl"

audit_ok="$(OPENCLAW_SESSIONS_DIR="$SESSIONS_DIR" bash "$SCRIPT_PATH" --limit 5)"
echo "$audit_ok" | jq -e '.violations | length == 0' >/dev/null || {
  echo "[test-execution-audit] expected zero violations for tool-backed execution" >&2
  exit 1
}

echo "[test-execution-audit] passed"
