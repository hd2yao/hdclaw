# AI News Daily Runbook

## Overview

该流程每天 08:30（Asia/Shanghai）自动执行，产出：
- 10 条 AI 热点
- 3 入选 + 7 未入选理由
- 3 篇 800-1200 字中文短文

并将结果写入 Obsidian，再推送 Telegram 简报。

## Prerequisites

1. `.env.local` 中配置：

```bash
AI_NEWS_OBSIDIAN_DIR=/Users/dysania/program/documents/obsidian_vault/news/daily
AI_NEWS_TELEGRAM_TARGET=<chat_id 或 @username>
AI_NEWS_AGENT_ID=main
AI_NEWS_TZ=Asia/Shanghai
AI_NEWS_CRON="30 8 * * *"
AI_NEWS_LOOKBACK_HOURS=24
AI_NEWS_FALLBACK_HOURS=48
AI_NEWS_TOP_N=10
AI_NEWS_PICK_N=3
```

2. Gateway 正常运行：

```bash
make status
openclaw health
```

## Setup

```bash
make sync
make install-skills
make setup-ai-news-daily
```

## Manual Trigger

```bash
make run-ai-news-daily-now
```

## Verify

- Obsidian 文件生成：
  - `${AI_NEWS_OBSIDIAN_DIR}/YYYY-MM-DD-ai-hotspots.md`
- Cron 状态：

```bash
openclaw cron list --json
openclaw cron runs --id "$(cat ~/.openclaw/ai-news-daily.jobid)" --limit 5
```

## Troubleshooting

1. `missing required value: AI_NEWS_TELEGRAM_TARGET`
- 在 `.env.local` 设置真实 Telegram 目标，非占位值。

2. 找不到 job id 文件
- 自动恢复命令：

```bash
openclaw cron list --json | jq -r '.jobs[] | select(.name=="ai-news-daily") | .id'
```

3. 推送失败但文件已落库
- 优先检查 Telegram 目标是否有效。
- 不影响当日 Obsidian 内容归档。

## Rollback

```bash
openclaw cron rm "$(cat ~/.openclaw/ai-news-daily.jobid)"
```

并按计划文档中的回滚步骤恢复仓库与环境变量。
