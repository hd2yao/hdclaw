#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SAMPLE_FILE="${1:-}"

if [[ -z "$SAMPLE_FILE" ]]; then
  OUTPUT_DIR="${AI_NEWS_OBSIDIAN_DIR:-$HOME/obsidian/news/daily}"
  SAMPLE_FILE="$(ls -1t "$OUTPUT_DIR"/*-ai-hotspots.md 2>/dev/null | head -n1 || true)"
fi

if [[ -z "$SAMPLE_FILE" ]]; then
  echo "[test-ai-news-contract] no generated output found; set AI_NEWS_OBSIDIAN_DIR or pass an explicit file path" >&2
  exit 1
fi

[[ -f "$SAMPLE_FILE" ]] || { echo "[test-ai-news-contract] file not found: $SAMPLE_FILE" >&2; exit 1; }

require_heading() {
  local heading="$1"
  if ! rg -q -F -x "$heading" "$SAMPLE_FILE"; then
    echo "[test-ai-news-contract] missing heading: $heading" >&2
    exit 1
  fi
}

require_heading "## 1. 每日热点新闻（10条）"
require_heading "## 2. 话题选择（3 入选 + 7 未入选）"
require_heading "## 3. 三篇话题推文（公众号短文）"

hotspots="$(rg -n '^### 热点 [0-9]{2}$' "$SAMPLE_FILE" | wc -l | tr -d ' ')"
selected="$(rg -n '^### 入选 [0-9]{2}$' "$SAMPLE_FILE" | wc -l | tr -d ' ')"
rejected="$(rg -n '^### 未入选 [0-9]{2}$' "$SAMPLE_FILE" | wc -l | tr -d ' ')"
articles="$(rg -n '^### 文章 [0-9]{2}$' "$SAMPLE_FILE" | wc -l | tr -d ' ')"

[[ "$hotspots" -eq 10 ]] || { echo "[test-ai-news-contract] expected 10 hotspots, got $hotspots" >&2; exit 1; }
[[ "$selected" -eq 3 ]] || { echo "[test-ai-news-contract] expected 3 selected, got $selected" >&2; exit 1; }
[[ "$rejected" -eq 7 ]] || { echo "[test-ai-news-contract] expected 7 rejected, got $rejected" >&2; exit 1; }
[[ "$articles" -eq 3 ]] || { echo "[test-ai-news-contract] expected 3 articles, got $articles" >&2; exit 1; }

counts="$(rg '字数：[0-9]+' "$SAMPLE_FILE" | rg -o '[0-9]+')"
count_n=0
while IFS= read -r n; do
  [[ -z "$n" ]] && continue
  count_n=$((count_n + 1))
  if (( n < 800 || n > 1200 )); then
    echo "[test-ai-news-contract] article word count out of range: $n" >&2
    exit 1
  fi
done <<< "$counts"

[[ "$count_n" -eq 3 ]] || { echo "[test-ai-news-contract] expected 3 word-count lines, got $count_n" >&2; exit 1; }

echo "[test-ai-news-contract] passed"
