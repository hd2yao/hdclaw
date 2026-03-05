#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: bash scripts/agent-web-query.sh \"<你的问题>\"" >&2
  exit 2
fi

user_query="$*"
session_id="web-query-$(date +%s)"

read -r -d '' prompt <<PROMPT || true
你正在处理需要最新信息的查询。
必须先执行：
node skills/custom/search-router/scripts/search-router.mjs --query "<根据用户问题构造查询>" --max 10
然后仅基于该检索结果回答用户问题。
禁止编造，禁止解释过程或路由细节。

用户问题：${user_query}
PROMPT

openclaw agent --session-id "$session_id" --message "$prompt" --json
