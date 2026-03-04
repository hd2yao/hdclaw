---
name: ai-news-daily
description: 生成每日 AI 热点（10 条）+ 选题决策（3 入选/7 未入选）+ 3 篇公众号短文，并落库到 Obsidian、推送 Telegram 简报。
---

# ai-news-daily

用于每日 AI 热点自动化生产，优先英文来源，中文输出。

## 触发场景

- Cron 定时触发（推荐）
- 用户请求：
  - “生成今天 AI 热点日报”
  - “给我 10 条 AI 热点并选 3 个话题写稿”

## 强制执行流程

1. 采集近 24 小时 AI 新闻（不足 10 条回溯到 48 小时）。
2. 去重并按热度评分排序（见 `references/output-contract.md`）。
3. 输出 10 条热点。
4. 从中选 3 个可写话题，给出入选与未入选理由。
5. 输出 3 篇中文公众号短文（每篇 800-1200 字）。
6. 将完整内容写入 Obsidian 当日文件。
7. 向 Telegram 推送简报（10 热点+链接+三篇标题与摘要）。

## 来源策略

- 英文优先固定白名单：见 `references/sources.en.md`。
- 只在不足时补充通用检索。
- 保留来源链接，避免无来源断言。

## 输出契约

必须遵循：`references/output-contract.md`
