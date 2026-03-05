# OpenClaw Local Web Search Without Brave Discovery

## Problem Statement
当前默认模型为 `local//data/qwen3.5-27b`。在此模式下，请求联网“关键词搜索”会触发 `web_search` 并报错 `missing_brave_api_key`。你要求保持本地模型，并且不配置 Brave key，同时仍可完成联网搜索能力。

## Goals
- 保持默认模型为 `local//data/qwen3.5-27b`。
- 不要求配置 `BRAVE_API_KEY`。
- 在 OpenClaw 内提供可用的联网搜索体验（至少可返回可点击来源链接）。
- 避免用户侧频繁遇到 `missing_brave_api_key` 报错。

## Non-Goals
- 不切回 `openai-codex/gpt-5.3-codex` 作为默认模型。
- 不引入 Brave 付费 key 方案。
- 不在本阶段重构全部技能或改动不相关模块。
- 不承诺“与 Codex API 完全同等”的搜索质量与召回。

## Target Users and Scenarios
- 用户：你本人（本机 OpenClaw 维护者，偏好本地模型主路由）。
- 场景：日常问答中要求“联网查一下今天/最近/某主题新闻”。
- 场景：已有 skills（如内容生产）需要稳定拿到外部来源链接。

## Constraints
- Technical: 当前 OpenClaw 版本下，`web_search` 默认 provider 路径会要求 API key；`web_fetch` 在无 Brave key 条件下可用。
- Product: 必须保留“本地模型优先”的使用体验，不能把核心路径退化为远端模型。
- Timeline: 需在当前仓库内落地可复用方案，并可通过脚本/配置持续生效。

## Assumptions
- 目录名假设为 `requirements/local-web-search`（用户未单独指定目录名）。
- “联网搜索可用”定义为：用户给出主题后，系统可检索并返回多来源链接，而不是仅抓取用户已提供 URL。
- 可以接受“非 `web_search` 工具路径”的替代实现，只要最终体验满足联网检索目标。

## Acceptance Criteria
- 在默认模型为 `local//data/qwen3.5-27b` 且未设置 `BRAVE_API_KEY` 的条件下，输入“搜索某主题最新信息”时，不再返回 `missing_brave_api_key`。
- 系统能返回至少 3 条结果，每条包含标题与来源链接。
- 结果来源可追溯，且响应中明确区分“检索得到的事实”与“模型推断”。
- `make verify` 或新增最小 smoke 命令可覆盖该能力回归检查。
- 变更仅影响搜索路径相关配置/脚本/提示，不破坏已存在的 `clawra-selfie` 与现有 skills 安装流程。

## Open Questions
- 允许的替代搜索路径优先级是什么：`browser` 自动检索、`web_fetch + 搜索引擎 URL`、还是新增自定义 search adapter？
- 是否允许引入“无需 key 的第三方检索源”（例如公共搜索页抓取）并接受其稳定性波动？
- 是否要显式禁用 `web_search`，改为强制走替代路径，以彻底消除 Brave 报错？
- 对“最新”类问题是否需要强制返回日期字段与时区标准化（例如北京时间）？
