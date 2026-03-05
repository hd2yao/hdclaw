#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

EMPTY_DIR="$TMP_DIR/empty"
OUTPUT_DIR="$TMP_DIR/output"
mkdir -p "$EMPTY_DIR" "$OUTPUT_DIR"

echo "[test-ai-news-contract-source] case1: empty AI_NEWS_OBSIDIAN_DIR should fail"
if AI_NEWS_OBSIDIAN_DIR="$EMPTY_DIR" bash "$ROOT_DIR/tests/skills/ai-news-daily-contract.sh" >/dev/null 2>&1; then
  echo "[test-ai-news-contract-source] expected failure on empty output dir" >&2
  exit 1
fi

echo "[test-ai-news-contract-source] case2: latest generated output should be used"
cp "$ROOT_DIR/tests/skills/fixtures/ai-news-daily.sample.md" "$OUTPUT_DIR/2026-03-04-ai-hotspots.md"
AI_NEWS_OBSIDIAN_DIR="$OUTPUT_DIR" bash "$ROOT_DIR/tests/skills/ai-news-daily-contract.sh" >/dev/null

echo "[test-ai-news-contract-source] passed"
