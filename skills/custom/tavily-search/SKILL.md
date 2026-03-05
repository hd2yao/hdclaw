---
name: tavily-search
description: 使用 Tavily Search API 执行联网检索并返回带来源链接的结构化结果。
allowed-tools: Bash(node:*) Bash(openclaw:*) Read
---

# tavily-search

使用 Tavily API 做联网搜索，适合“查最新资讯 + 要来源链接”的任务。

## 前置条件
- 需要 `TAVILY_API_KEY`。
- 若缺失 key，本 skill 会明确报错并提示配置方式。

## 命令
```bash
node skills/custom/tavily-search/scripts/tavily-search.mjs --query "OpenAI latest news" --max 5
```

## 工作流
1. 运行上面的命令拿到搜索结果 JSON。
2. 选择最相关来源。
3. 如需提取正文，再对目标 URL 使用 `web_fetch`。
4. 输出至少 3 条结果（标题 + 链接 + 摘要 + 时间如可用）。

## 错误处理
- `missing_tavily_api_key`：未配置 key。
- `tavily_http_error`：上游 HTTP 错误。
- `tavily_response_invalid`：返回结构异常或空结果。
