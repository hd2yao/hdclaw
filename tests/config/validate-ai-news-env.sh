#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

ENV_BAD="$TMP_DIR/.env.bad"
ENV_OK="$TMP_DIR/.env.ok"

cat > "$ENV_BAD" <<'EOB'
AI_NEWS_OBSIDIAN_DIR=/tmp/obsidian/news/daily
AI_NEWS_AGENT_ID=main
AI_NEWS_TZ=Asia/Shanghai
AI_NEWS_CRON="30 8 * * *"
AI_NEWS_LOOKBACK_HOURS=24
AI_NEWS_FALLBACK_HOURS=48
AI_NEWS_TOP_N=10
AI_NEWS_PICK_N=3
EOB

cat > "$ENV_OK" <<'EOG'
AI_NEWS_OBSIDIAN_DIR=/tmp/obsidian/news/daily
AI_NEWS_TELEGRAM_TARGET=@example_target
AI_NEWS_AGENT_ID=main
AI_NEWS_TZ=Asia/Shanghai
AI_NEWS_CRON="30 8 * * *"
AI_NEWS_LOOKBACK_HOURS=24
AI_NEWS_FALLBACK_HOURS=48
AI_NEWS_TOP_N=10
AI_NEWS_PICK_N=3
EOG

echo "[test-ai-news-env] case1: missing AI_NEWS_TELEGRAM_TARGET should fail"
if OPENCLAW_ENV_FILE="$ENV_BAD" bash "$ROOT_DIR/scripts/setup-ai-news-daily-cron.sh" --dry-run >/dev/null 2>&1; then
  echo "[test-ai-news-env] expected failure but got success" >&2
  exit 1
fi

echo "[test-ai-news-env] case2: complete env should pass"
OPENCLAW_ENV_FILE="$ENV_OK" bash "$ROOT_DIR/scripts/setup-ai-news-daily-cron.sh" --dry-run >/dev/null

echo "[test-ai-news-env] passed"
