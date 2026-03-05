#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT_PATH="$ROOT_DIR/skills/custom/tavily-search/scripts/tavily-search.mjs"

if [[ "${SKIP_NETWORK_TESTS:-false}" == "true" ]]; then
  echo "[test-tavily-search] skipped (SKIP_NETWORK_TESTS=true)"
  exit 0
fi

if [[ -f "$ROOT_DIR/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ROOT_DIR/.env.local"
  set +a
fi

if [[ -z "${TAVILY_API_KEY:-}" ]]; then
  echo "[test-tavily-search] skipped (TAVILY_API_KEY not configured)"
  exit 0
fi

if [[ ! -x "$SCRIPT_PATH" ]]; then
  echo "[test-tavily-search] script not executable: $SCRIPT_PATH" >&2
  exit 1
fi

echo "[test-tavily-search] running live query"
json_out="$(node "$SCRIPT_PATH" --query "OpenAI latest news" --max 3)"

echo "$json_out" | jq -e '.provider == "tavily"' >/dev/null || {
  echo "[test-tavily-search] expected provider=tavily" >&2
  exit 1
}

echo "$json_out" | jq -e '.count >= 1' >/dev/null || {
  echo "[test-tavily-search] expected at least 1 result" >&2
  exit 1
}

echo "$json_out" | jq -e '.results | all(.[]; (.url | test("^https?://")))' >/dev/null || {
  echo "[test-tavily-search] expected valid result URLs" >&2
  exit 1
}

echo "[test-tavily-search] passed"
