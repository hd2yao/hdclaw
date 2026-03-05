#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
KEYLESS_SCRIPT="$ROOT_DIR/skills/custom/keyless-search/scripts/keyless-search.mjs"

if [[ "${SKIP_NETWORK_TESTS:-false}" == "true" ]]; then
  echo "[test-no-brave] skipped (SKIP_NETWORK_TESTS=true)"
  exit 0
fi

search_enabled="$(openclaw config get tools.web.search.enabled --json | jq -r '.')"
if [[ "$search_enabled" != "false" ]]; then
  echo "[test-no-brave] expected tools.web.search.enabled=false, got: $search_enabled" >&2
  exit 1
fi

echo "[test-no-brave] probing agent behavior when web_search is unavailable"
agent_json="$(openclaw agent --to +17770001234 --message "请调用 web_search 工具搜索 OpenAI 新闻，如果不可用直接返回原因。" --json)"
agent_text="$(echo "$agent_json" | jq -r '.result.payloads[0].text // ""')"

if echo "$agent_text" | rg -qi 'missing_brave_api_key|Brave Search API key'; then
  echo "[test-no-brave] regression: still seeing Brave key missing error" >&2
  exit 1
fi

echo "[test-no-brave] probing keyless-search network path"
keyless_json="$(node "$KEYLESS_SCRIPT" --query "OpenAI latest news" --max 3)"

echo "$keyless_json" | jq -e '.provider == "bing-rss"' >/dev/null || {
  echo "[test-no-brave] expected provider=bing-rss" >&2
  exit 1
}

echo "$keyless_json" | jq -e '.count >= 3' >/dev/null || {
  echo "[test-no-brave] expected at least 3 results" >&2
  exit 1
}

echo "[test-no-brave] passed"
