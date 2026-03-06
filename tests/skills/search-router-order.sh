#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT_PATH="$ROOT_DIR/skills/custom/search-router/scripts/search-router.mjs"

if [[ ! -x "$SCRIPT_PATH" ]]; then
  echo "[test-search-router] script not executable: $SCRIPT_PATH" >&2
  exit 1
fi

echo "[test-search-router] checking deterministic route order"
dry_out="$(node "$SCRIPT_PATH" --query "OpenAI latest news" --dry-run)"

echo "$dry_out" | jq -e '.route == "dry-run"' >/dev/null || {
  echo "[test-search-router] expected dry-run route" >&2
  exit 1
}

echo "$dry_out" | jq -e '.attempts[0].route == "openai-native" and .attempts[1].route == "tavily" and .attempts[2].route == "keyless" and .attempts[3].route == "brave"' >/dev/null || {
  echo "[test-search-router] unexpected route order" >&2
  exit 1
}

echo "$dry_out" | jq -e '.aiNewsMode == true and (.queryPlan | length) >= 3' >/dev/null || {
  echo "[test-search-router] expected ai-news query plan expansion in dry-run" >&2
  exit 1
}

if [[ "${SKIP_NETWORK_TESTS:-false}" == "true" ]]; then
  echo "[test-search-router] skipped live probe (SKIP_NETWORK_TESTS=true)"
  exit 0
fi

echo "[test-search-router] running live probe"
live_out="$(node "$SCRIPT_PATH" --query "latest AI news" --max 3)"

echo "$live_out" | jq -e '.route | IN("openai-native","tavily","keyless","brave")' >/dev/null || {
  echo "[test-search-router] expected a successful route" >&2
  exit 1
}

echo "$live_out" | jq -e '.count >= 1' >/dev/null || {
  echo "[test-search-router] expected at least one result" >&2
  exit 1
}

echo "$live_out" | jq -e '.results | all(.[]; (.url | test("^https?://")))' >/dev/null || {
  echo "[test-search-router] expected valid URLs" >&2
  exit 1
}

echo "[test-search-router] passed"
