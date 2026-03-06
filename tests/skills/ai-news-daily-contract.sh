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

require_pattern() {
  local pattern="$1"
  local message="$2"
  if ! rg -q "$pattern" "$SAMPLE_FILE"; then
    echo "[test-ai-news-contract] $message" >&2
    exit 1
  fi
}

require_count() {
  local pattern="$1"
  local expected="$2"
  local label="$3"
  local actual
  actual="$(rg -n "$pattern" "$SAMPLE_FILE" | wc -l | tr -d ' ')"
  [[ "$actual" -eq "$expected" ]] || {
    echo "[test-ai-news-contract] expected $expected $label, got $actual" >&2
    exit 1
  }
}

require_absent() {
  local pattern="$1"
  local message="$2"
  if rg -q "$pattern" "$SAMPLE_FILE"; then
    echo "[test-ai-news-contract] $message" >&2
    exit 1
  fi
}

require_pattern '^# 每日 AI 热点（[0-9]{4}-[0-9]{2}-[0-9]{2}）$' "missing daily title heading"
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

require_count '^- 标题：' 10 "hotspot titles"
require_count '^- 原文标题：' 10 "hotspot original titles"
require_count '^- 归类：' 13 "category lines"
require_count '^- 中文摘要：' 10 "hotspot chinese summaries"
require_count '^- 来源：' 10 "hotspot source lines"
require_count '^- 热度评分：' 10 "hotspot score lines"

require_count '^- 入选结论：' 3 "selected conclusions"
require_count '^- 评分拆解：' 3 "selected score breakdowns"
require_count '^- 入选原因：' 3 "selected reason blocks"
require_count '^- 传播切入角度：' 3 "selected angle blocks"

require_count '^- 当前结论：' 7 "rejected conclusions"
require_count '^- 未入选原因：' 7 "rejected reason blocks"
require_count '^- 若补充以下信息可重评：' 7 "rejected retry blocks"

require_count '^- 对应话题：' 3 "article topic lines"
require_count '^- 建议标题：' 3 "article recommendation titles"
require_count '^\*\*开场导语\*\*$' 3 "article lead sections"
require_count '^\*\*先看结论\*\*$' 3 "article tl-dr sections"
require_count '^\*\*事件脉络\*\*$' 3 "article timeline sections"
require_count '^\*\*为什么值得写\*\*$' 3 "article why sections"
require_count '^\*\*正文展开\*\*$' 3 "article body sections"
require_count '^\*\*可直接复用的观点\*\*$' 3 "article takeaway sections"
require_count '^\*\*互动问题\*\*$' 3 "article interaction sections"

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

require_absent '^- 标题：(The Verge|VentureBeat|TechCrunch|路透|彭博|MSN|CNBC)(发布|推进|强化|出现|带来)' "hotspot title fallback is using a media brand as the subject"
require_absent '&#[0-9]+;' "html entity leakage in output"

echo "[test-ai-news-contract] passed"
