#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT_PATH="$ROOT_DIR/skills/custom/keyless-search/scripts/keyless-search.mjs"

if [[ "${SKIP_NETWORK_TESTS:-false}" == "true" ]]; then
  echo "[test-keyless-search] skipped (SKIP_NETWORK_TESTS=true)"
  exit 0
fi

if [[ ! -x "$SCRIPT_PATH" ]]; then
  echo "[test-keyless-search] script not executable: $SCRIPT_PATH" >&2
  exit 1
fi

echo "[test-keyless-search] running live query"
json_out="$(node "$SCRIPT_PATH" --query "OpenAI latest news" --max 3)"

echo "$json_out" | jq -e '.provider == "bing-rss"' >/dev/null || {
  echo "[test-keyless-search] expected provider=bing-rss" >&2
  exit 1
}

echo "$json_out" | jq -e '.count >= 3' >/dev/null || {
  echo "[test-keyless-search] expected at least 3 results" >&2
  exit 1
}

echo "$json_out" | jq -e '.results | all(.[]; (.title | length) > 0 and (.url | test("^https?://")))' >/dev/null || {
  echo "[test-keyless-search] expected non-empty titles and valid URLs" >&2
  exit 1
}

echo "[test-keyless-search] passed"
