#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF' >&2
Usage:
  bash scripts/agent-web-query.sh [--new-session] [--session-id <id>] "<你的问题>"

Options:
  --new-session       为这次查询新建一个 session
  --session-id <id>   显式指定 session id
EOF
}

session_id="${OPENCLAW_AGENT_WEB_QUERY_SESSION_ID:-web-query-main}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --new-session)
      session_id="web-query-$(date +%s)-$$"
      shift
      ;;
    --session-id)
      session_id="${2:-}"
      if [[ -z "$session_id" ]]; then
        echo "[agent-web-query] --session-id requires a value" >&2
        usage
        exit 2
      fi
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    -*)
      echo "[agent-web-query] unknown option: $1" >&2
      usage
      exit 2
      ;;
    *)
      break
      ;;
  esac
done

if [[ $# -lt 1 ]]; then
  usage
  exit 2
fi

user_query="$*"

read -r -d '' prompt <<PROMPT || true
你正在处理需要最新信息的查询。
必须先执行：
node skills/custom/search-router/scripts/search-router.mjs --query "<根据用户问题构造查询>" --max 10
然后仅基于该检索结果回答用户问题。
禁止编造，禁止解释过程或路由细节。

用户问题：${user_query}
PROMPT

openclaw agent --session-id "$session_id" --message "$prompt" --json
