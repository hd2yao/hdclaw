# OpenClaw Daily AI Hotspot Automation Implementation Plan

## Goal

在现有 OpenClaw 本机环境中上线一条稳定的每日自动化链路，确保每天 08:30（Asia/Shanghai）自动交付以下产物：
- 10 条 AI 热点（英文源为主、中文输出、含来源链接）
- 3 个入选话题 + 7 个未入选话题及原因
- 3 篇中文公众号短文（每篇 800-1200 字）

并将完整产物落库至 Obsidian，向 Telegram 推送当日简报。

## Scope

- In Scope
  - 新增 AI 日报专用 custom skill（提示词规范、输出契约、来源策略）。
  - 新增 cron 安装/更新脚本（upsert job）。
  - 新增每日任务 prompt 模板与输出格式约束。
  - 新增 `.env.example` 配置项（Obsidian 目录、Telegram chat_id 等）。
  - 新增运行与故障排查文档。
  - 新增基础测试（配置校验 + 脚本 dry-run + 结构校验）。

- Out of Scope
  - 自动发布到小红书/微信公众号。
  - 引入新 Web 后台或数据库系统。
  - 构建复杂人工审核工作流（本阶段保持全自动）。

## Architecture

### A. 组件

1. `cron orchestration`（OpenClaw 内置）
- 每日定时触发 agent turn（isolated session）。

2. `ai-news-daily custom skill`（仓库内）
- 约束抓取策略、热度评分、选题规则、成稿模板。
- 强制输出结构与字数限制。

3. `prompt template`（仓库内）
- 模板内注入运行参数：Obsidian 输出目录、Telegram 目标、日期、时区。

4. `delivery + persistence`
- Agent 在单次 run 内完成：
  - 写 Obsidian 文件
  - 发送 Telegram 简报
  - 返回机器可读执行摘要（状态/文件路径/统计）

### B. 数据流

1. Cron job 触发。
2. Agent 按模板执行：
  - 从英文优先来源检索近 24h AI 信息（使用 OpenClaw agent 的 `web_search` + `web_fetch` 能力）；不足 10 条回溯到 48h 补齐。
  - 去重与热度排序后确定 Top10。
  - 选 3 个可写话题并给出“入选/未入选”理由。
  - 输出 3 篇 800-1200 字中文短文。
3. Agent 将完整 Markdown 写入：
- `/Users/dysania/program/documents/obsidian_vault/news/daily/YYYY-MM-DD-ai-hotspots.md`
4. Agent 发送 Telegram 简报（10 热点 + 链接 + 三篇标题与摘要）。
5. Agent 返回 JSON 风格执行摘要（供 `cron runs` 排障）。

### C. 关键实现决策

- 调度：使用 `openclaw cron`（不引入系统 crontab/launchd）
- 模式：`--session isolated`，避免污染主会话上下文
- 推送目标：固定 chat_id（一次配置，长期复用）
- 来源：英文优先固定白名单 + 必要补检索
- 风格：中文资讯解读型
- 热度策略：高热优先（显式评分规则）
  - 总分 100：来源权威性 35 + 时效性 25 + 跨源共现度 25 + 受众可写性 15
  - 来源权威性：官方发布/主流媒体/社区首发按 3 档映射
  - 时效性：24h 内满分，24-48h 线性衰减
  - 跨源共现度：同事件被 >=2 个独立来源提及加分
  - 受众可写性：能否形成“事实+影响+建议”结构
  - Top10 按总分降序；选题 Top3 需满足“尽量不同子类目”约束

## Backend Changes

### 1) 新增文件

- `/Users/dysania/program/openclaw/skills/custom/ai-news-daily/SKILL.md`
  - 定义触发语、流程、输出约束、失败处理

- `/Users/dysania/program/openclaw/skills/custom/ai-news-daily/references/sources.en.md`
  - 英文优先来源白名单（官方博客 + 主流媒体 + 社区）

- `/Users/dysania/program/openclaw/skills/custom/ai-news-daily/references/output-contract.md`
  - Markdown 契约（模块顺序、字段、字数）

- `/Users/dysania/program/openclaw/scripts/setup-ai-news-daily-cron.sh`
  - 从 `.env.local` 读取参数
  - 生成最终 cron message
  - 使用 `openclaw cron list --json | jq -r '.jobs[] | select(.name=="ai-news-daily") | .id'` 解析 job id
  - Upsert 任务：若 `ai-news-daily` 已存在则 `cron edit`，否则 `cron add`
  - 将最终 job id 持久化到 `~/.openclaw/ai-news-daily.jobid`

- `/Users/dysania/program/openclaw/scripts/ai-news-daily-prompt.template.md`
  - 使用 `envsubst` 渲染（变量格式 `${OBSIDIAN_DIR}` `${TELEGRAM_TARGET}` `${TZ}` `${DATE}`）

- `/Users/dysania/program/openclaw/scripts/run-ai-news-daily-now.sh`
  - 一键手动触发（用于联调与验收）
  - 默认从 `~/.openclaw/ai-news-daily.jobid` 读取 job id（允许参数覆盖）

- `/Users/dysania/program/openclaw/tests/config/validate-ai-news-env.sh`
  - 校验必需环境变量存在/格式合法

- `/Users/dysania/program/openclaw/tests/skills/ai-news-daily-contract.sh`
  - 用样例输出校验章节完整性与 3 篇字数范围

- `/Users/dysania/program/openclaw/docs/ai-news-daily-runbook.md`
  - 安装、联调、巡检、故障处理

### 2) 修改文件

- `/Users/dysania/program/openclaw/skills/catalog.yaml`
  - 新增 `ai-news-daily` custom skill 条目并启用

- `/Users/dysania/program/openclaw/.env.example`
  - 新增变量：
    - `AI_NEWS_OBSIDIAN_DIR=/Users/dysania/program/documents/obsidian_vault/news/daily`
    - `AI_NEWS_TELEGRAM_TARGET=`（chat_id 或 @username）
    - `AI_NEWS_AGENT_ID=main`（该 agent 需具备 web 检索能力并能通过 message tool 向 Telegram 推送）
    - `AI_NEWS_TZ=Asia/Shanghai`
    - `AI_NEWS_CRON=30 8 * * *`
    - `AI_NEWS_LOOKBACK_HOURS=24`
    - `AI_NEWS_FALLBACK_HOURS=48`
    - `AI_NEWS_TOP_N=10`
    - `AI_NEWS_PICK_N=3`

- `/Users/dysania/program/openclaw/Makefile`
  - 新增目标：
    - `setup-ai-news-daily`
    - `run-ai-news-daily-now`
    - `test-ai-news-daily`

- `/Users/dysania/program/openclaw/README.md`
  - 新增“每日 AI 热点自动化”快速使用说明

## Frontend Design (required when UI is involved)

本需求不涉及仓库内前端页面或交互式 UI 变更，以下项不适用：
- Information architecture: N/A
- States and interactions: N/A
- Responsive behavior: N/A
- Accessibility: N/A
- Validation screenshot points: N/A

## Data and API Changes

- 外部 API
  - 不新增强依赖 API；优先使用 OpenClaw agent 的 web 搜索/抓取能力。

- 本地配置数据
  - 新增 `AI_NEWS_*` 环境变量用于调度与输出路径控制。

- 输出数据契约（Markdown）
  - 文件头：日期 + 生成时间 + 数据时窗
  - Section 1：10 热点（标题、来源、发布时间、链接、一句话摘要、热度分）
  - Section 2：3 入选 + 7 未入选（每条原因）
  - Section 3：三篇短文（每篇 800-1200 字）

- Telegram 消息契约
  - 当日标题
  - Top10（精简标题 + 链接）
  - 三篇标题 + 80-120 字摘要
  - 超长时自动分段（最多 2 条）

## Task Breakdown

1. 配置与脚手架
- 新增 `AI_NEWS_*` 变量到 `.env.example`。
- 增加 Makefile 目标与 README 导航。

2. Skill 与模板落地
- 创建 `skills/custom/ai-news-daily` 目录与 `SKILL.md`。
- 编写来源白名单与输出契约文件。
- 编写 cron message 模板。

3. Cron upsert 脚本
- 实现 `scripts/setup-ai-news-daily-cron.sh`：
  - 校验变量
  - 渲染 message
  - 用 `cron list --json + jq` 查找同名 job id
  - add/edit 幂等更新
  - 将 job id 写入 `~/.openclaw/ai-news-daily.jobid`

4. 手动运行脚本
- 实现 `scripts/run-ai-news-daily-now.sh`：
  - 从 `~/.openclaw/ai-news-daily.jobid` 读取 job id（可用 `--job-id` 覆盖）
  - `openclaw cron run <id>`
  - 打印最近 run 状态

5. 测试与校验
- 新增环境变量校验脚本。
- 新增输出契约校验脚本。
- 把 `test-ai-news-daily` 挂到 Makefile。

6. 文档与验收
- 补充 runbook（联调、巡检、回滚）。
- 完成一次手动 run 验收并记录样例。

## Test Strategy

### A. 静态/脚本测试

1. `tests/config/validate-ai-news-env.sh`
- 缺失 `AI_NEWS_OBSIDIAN_DIR` 时失败
- 缺失 `AI_NEWS_TELEGRAM_TARGET` 时失败
- `AI_NEWS_CRON` 非法表达式时失败

2. `tests/skills/ai-news-daily-contract.sh`
- 输入样例 Markdown，校验必须包含 3 大 section
- 校验热点数量=10
- 校验入选数量=3、未入选数量=7
- 校验 3 篇文章字数在 800-1200

### B. 集成测试（手动 + 命令）

1. 安装与同步
- `make sync`
- `make install-skills`
- `make setup-ai-news-daily`

2. 手动触发
- `make run-ai-news-daily-now`

3. 验证
- Obsidian 目录出现当日文件
- `openclaw cron runs --id <job_id> --limit 3` 显示最新状态 `ok`
- Telegram 收到简报（手动验收项）
- 可选自动验证：使用 Telegram Bot API 拉取最近一条消息并校验标题关键字

### C. 验收与 Discovery 对齐

- 调度与落库：满足 08:30 自动触发与单日单文件
- 内容完整性：满足三段式结构与链接/字数要求
- 推送：满足“10 热点 + 链接 + 三篇标题与摘要”
- 可观测性：可从 `cron runs` 定位失败阶段

## Rollback Plan

1. 停止自动任务
- 查找 job：`openclaw cron list --json`
- 禁用：`openclaw cron disable <job_id>`
- 或删除：`openclaw cron rm <job_id>`

2. 回退仓库改动
- 优先使用 git 精确回退已修改文件：
  - `git restore skills/catalog.yaml .env.example Makefile README.md`
- 删除新增文件：
  - `rm -rf skills/custom/ai-news-daily`
  - `rm -f scripts/setup-ai-news-daily-cron.sh scripts/ai-news-daily-prompt.template.md scripts/run-ai-news-daily-now.sh`
  - `rm -f tests/config/validate-ai-news-env.sh tests/skills/ai-news-daily-contract.sh docs/ai-news-daily-runbook.md`
- 计划文档与评审文档保留（用于审计）

3. 回退运行配置
- 删除 `.env.local` 中 `AI_NEWS_*` 变量
- 保留 Obsidian 已生成内容，不做自动删除

4. 验证回退完成
- `openclaw cron list --json` 不再包含 `ai-news-daily`
- 次日 08:30 不再自动执行

## Risks and Mitigations

- 风险：热点真实性/准确性不足（高热优先策略带噪声）
  - 缓解：输出中保留来源链接与“未多源验证”标记位；后续可切换平衡策略

- 风险：部分来源临时不可访问导致不足 10 条
  - 缓解：自动从 24h 回溯到 48h 补齐；仍不足时输出“数据不足说明”

- 风险：Telegram 推送超长或失败
  - 缓解：消息分段；失败重试 1 次；失败不阻断 Obsidian 落库

- 风险：模型输出结构漂移
  - 缓解：在 prompt 中强约束输出契约；增加 contract 测试脚本

- 风险：cron 重复创建多个同名任务
  - 缓解：setup 脚本采用“按名称 upsert”逻辑，保证幂等
