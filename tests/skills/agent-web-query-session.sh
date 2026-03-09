#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT_PATH="$ROOT_DIR/scripts/agent-web-query.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

BIN_DIR="$TMP_DIR/bin"
LOG_DIR="$TMP_DIR/logs"
mkdir -p "$BIN_DIR" "$LOG_DIR"

cat > "$BIN_DIR/openclaw" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$@" > "${OPENCLAW_STUB_LOG:?}"
EOF
chmod +x "$BIN_DIR/openclaw"

echo "[test-agent-web-query-session] case1: default should reuse fixed session"
OPENCLAW_STUB_LOG="$LOG_DIR/default.args" PATH="$BIN_DIR:$PATH" \
  bash "$SCRIPT_PATH" "AI 最新新闻" >/dev/null

grep -qx -- '--session-id' "$LOG_DIR/default.args" || {
  echo "[test-agent-web-query-session] expected --session-id flag in default invocation" >&2
  exit 1
}

grep -qx -- 'web-query-main' "$LOG_DIR/default.args" || {
  echo "[test-agent-web-query-session] expected default session id web-query-main" >&2
  exit 1
}

echo "[test-agent-web-query-session] case2: --new-session should create a fresh session id"
OPENCLAW_STUB_LOG="$LOG_DIR/new.args" PATH="$BIN_DIR:$PATH" \
  bash "$SCRIPT_PATH" --new-session "AI 最新新闻" >/dev/null

new_session_id="$(awk '/^web-query-/{print; exit}' "$LOG_DIR/new.args")"
[[ -n "$new_session_id" ]] || {
  echo "[test-agent-web-query-session] expected a generated web-query-* session id" >&2
  exit 1
}

[[ "$new_session_id" != "web-query-main" ]] || {
  echo "[test-agent-web-query-session] expected --new-session to avoid the default session id" >&2
  exit 1
}

echo "[test-agent-web-query-session] passed"
