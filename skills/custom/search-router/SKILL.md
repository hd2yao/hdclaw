---
name: search-router
description: 统一联网检索路由：优先模型原生检索，其次 tavily/keyless，最后才使用 Brave key。
allowed-tools: Bash(node:*) Bash(openclaw:*) Read
---

# search-router

把联网检索路由固定为如下顺序：
1. 模型原生检索（仅当当前主模型支持且可用）
2. `tavily-search`
3. `keyless-search`
4. Brave（最后兜底）

## 何时使用
- 用户要求“最新新闻 / 联网搜索 / 需要来源链接”。
- 希望避免直接触发 `missing_brave_api_key`。

## 命令
```bash
node skills/custom/search-router/scripts/search-router.mjs --query "OpenAI latest news" --max 10
```

## 输出要求
- 结果至少包含：标题、链接、发布时间（如可用）、摘要。
- 回复用户时，默认只给结果，不展开路由细节。
- 仅在用户追问时再说明具体走了哪条路由。

## 排障
- 查看路由计划（不发起联网请求）：
```bash
node skills/custom/search-router/scripts/search-router.mjs --query "OpenAI latest news" --dry-run
```
