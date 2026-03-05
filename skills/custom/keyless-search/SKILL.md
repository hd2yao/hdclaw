---
name: keyless-search
description: 无 API key 的联网关键词检索（基于 Bing RSS），可与 web_fetch 组合做来源追踪。
allowed-tools: Bash(node:*) Bash(openclaw:*) Read
---

# keyless-search

无 API key 的关键词联网检索 skill。

## 何时使用
- 用户要求“联网搜索/查最新/找来源链接”。
- 当前环境未配置 `BRAVE_API_KEY`，`web_search` 可能报错。

## 工作流
1. 先运行：
   - `node skills/custom/keyless-search/scripts/keyless-search.mjs --query "<你的查询词>" --max 5`
2. 从输出结果中选择最相关来源。
3. 如需细节，再对目标 URL 使用 `web_fetch` 抓取全文。
4. 回复时给出标题、链接、发布时间（若有），并标注检索时间。

## 输出要求
- 至少返回 3 条结果（若可用结果不足，明确说明不足原因）。
- 每条必须含可点击链接。
- 对“今天/最新”问题，优先展示最近日期结果并注明日期。
