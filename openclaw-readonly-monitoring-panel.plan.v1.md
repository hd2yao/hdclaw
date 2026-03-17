# OpenClaw Readonly Monitoring Panel Implementation Plan

## Goal

基于仓库现有 `projects/openclaw-dashboard` 后端与前端骨架，交付一个只读监控面板 MVP，支持以 `OpenClaw 节点 -> agents -> 任务时间线` 的层级方式展示系统状态，并同时满足团队运维和非技术同事的查看需求。

## Scope

- 保留只读定位，不增加任何写操作或控制入口。
- 首页采用双层结构：顶部业务摘要，主体区域为运维明细。
- 支持多个 OpenClaw 节点实例接入，并按节点展示下属 agents。
- 支持 1 到 2 秒级的状态刷新体验。
- 支持短期历史，范围先收敛为最近 1 小时或最近 24 小时。
- 展示任务时间线、当前阶段、开始时间、持续时间和最近进展摘要。
- 不展示模型原始思考、完整会话正文或工具调用参数。

## Architecture

- 后端继续采用 `Express + SQLite + WebSocket` 架构，`NodeManager` 负责轮询 OpenClaw gateway 并持久化当前态与短期历史。
- 数据链路优先沿用现有 `status`、`agents.list`、`sessions.list` 三个 RPC；若后续节点侧提供单次 `dashboard.snapshot` 聚合 RPC，则只替换 `rpcClient` 适配层，不改上层存储与 API。
- 当前态数据继续写入 `nodes`、`agents`、`sessions`、`message_counters`、`resource_snapshots`；任务时间线与短期状态变化新增专用历史表，避免全部压进 `events.payload_json` 后难以查询。
- REST 负责页面首屏引导和按需查询，WebSocket `/ws` 负责推送完整快照和增量更新，保持 payload 可序列化且可局部 merge。
- 前端在已有组件骨架上做“真实数据接线 + 信息分层”，优先复用 `frontend/src/components/*` 与 `frontend/src/hooks/useDashboardSocket.ts`，避免推倒重来。

## Backend Changes

- 修改 [src/types.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/src/types.ts)
  - 为节点、agent、任务时间线定义明确的监控 DTO。
  - 补充 `DashboardOverviewResponse`、`DashboardNodeDetail`、`AgentTimelineEvent`、`DashboardSummary` 等类型。
  - 扩展 `AgentSnapshot` 与 `SessionSnapshot`，加入当前任务摘要、阶段、开始时间、最后进展时间等字段。

- 修改 [src/db/schema.sql](/Users/dysania/program/openclaw/projects/openclaw-dashboard/src/db/schema.sql)
  - 为 `agents` 表增加当前任务标题、摘要、阶段、任务开始时间、最近进展时间等列。
  - 新增 `agent_timeline_events` 表，保存 `node_id`、`agent_id`、`session_id`、`event_type`、`summary`、`detail`、`status`、`created_at`。
  - 为短期查询增加 `(node_id, agent_id, created_at DESC)` 索引。

- 修改 [src/db/repositories/telemetryRepository.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/src/db/repositories/telemetryRepository.ts)
  - 让 `replaceAgents`、`replaceSessions` 写入扩展字段。
  - 新增 `appendAgentTimelineEvents`、`getDashboardOverview`、`getNodeDetail`、`getAgentTimeline` 等查询方法。
  - 将现有 `getOverview()` 逐步收敛为前端真实使用的 overview contract，而不是只返回节点卡片的最小字段。

- 新增 [src/db/repositories/dashboardRepository.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/src/db/repositories/dashboardRepository.ts)
  - 将面板聚合查询从通用 telemetry 落库逻辑中拆开。
  - 专门负责首页摘要、节点详情、资源历史、agent 列表与 timeline 聚合。

- 修改 [src/services/rpcClient.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/src/services/rpcClient.ts)
  - 规范化 `status`、`agents.list`、`sessions.list` 返回值到统一 snapshot 模型。
  - 优先从 session/status 元数据中提取任务摘要、阶段和时间信息。
  - 对上游字段缺失做降级映射，至少保证“当前任务标题/摘要为空时仍可显示状态与会话 ID”。

- 修改 [src/services/nodeManager.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/src/services/nodeManager.ts)
  - 在每次轮询时比较前后两次 snapshot，生成节点状态变化、agent 状态变化与时间线事件。
  - 仅在状态或进展发生变化时写入 `agent_timeline_events`，避免每秒写入完全重复的历史。
  - 调整广播内容，只推送可序列化的 `dashboard.snapshot`、`node.delta`、`agent.delta`、`session.event`。

- 修改 [src/services/wsGateway.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/src/services/wsGateway.ts)
  - 首次连接发送完整 `dashboard.snapshot`。
  - 后续基于 event bus 推增量事件，保持前端可按 `nodeId`、`agentId` 局部更新。

- 修改 [src/routes/nodes.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/src/routes/nodes.ts)
  - 保留现有节点注册与列表接口。
  - 让 `GET /api/overview` 返回真实 dashboard overview contract。
  - 新增 `GET /api/nodes/:nodeId` 与 `GET /api/nodes/:nodeId/agents/:agentId/timeline?window=1h|24h`。

- 修改 [src/app.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/src/app.ts)
  - 确保新增只读接口挂载在既有 token 保护链路下。

## Frontend Design

### Information Architecture

- 左侧保留节点舰队列表，按健康状态、在线 agents 数与最近心跳展示节点卡片。
- 主区域顶部新增全局业务摘要卡：
  - 在线节点数
  - 异常节点数
  - 工作中 agents 数
  - 停滞任务数
  - 最近完成任务/最近产出数
- 主区域中部展示当前选中节点详情：
  - 节点身份与 endpoint
  - 健康状态与最近心跳
  - 消息统计
  - 资源趋势图
- 主区域底部保持双栏：
  - 左侧 agent 表格，突出所属节点、状态、当前任务摘要、当前阶段、持续时间、最近更新时间
  - 右侧时间线面板，展示所选 agent 的最近历史事件与阶段变化

### States and Interactions

- 首屏先通过 `GET /api/overview` 引导渲染，再建立 `/ws` 连接接收秒级更新。
- 点击节点卡片切换主视图上下文，并默认选择该节点下第一个 agent。
- 点击 agent 行时，按需加载该 agent 的 timeline；若 WebSocket 已持续收到该 agent 事件，则直接 merge 到面板。
- 当 WebSocket 断开时，保留最后一次快照并在顶栏显式显示连接状态，不清空页面。
- 当节点暂无 agents、agent 无历史、节点离线、接口报错时，分别提供明确空态和错误态。

### Responsive Behavior

- 桌面端 `>= 1280px` 使用三段式布局：侧边节点列表、主内容、底部双栏明细。
- 平板端 `768px - 1279px` 将顶部摘要横向压缩，节点详情与资源图堆叠，底部改为 tab 或纵向堆叠。
- 手机端 `< 768px` 改为单列：摘要卡 -> 节点选择 -> 节点详情 -> agent 列表 -> 时间线抽屉/折叠区。

### Accessibility

- 节点卡片与 agent 行保持键盘可聚焦和 `aria-selected` 状态。
- 状态 badge 除颜色外必须有文字，避免仅靠颜色表达在线/异常。
- 时间字段默认显示相对时间，同时提供绝对时间 `title` 供 hover/assistive tech 使用。
- WebSocket 连接状态与错误提示放入 `aria-live="polite"` 区域。

### Validation Screenshot Points

- 桌面端：3 个节点、1 个 degraded、1 个 offline、至少 1 个 busy agent。
- 桌面端：选中某 agent 后时间线面板显示 5 条内事件。
- 平板端：摘要与节点详情堆叠时不出现横向滚动。
- 手机端：节点切换、agent 列表和 timeline 抽屉可正常操作。
- 断线态：顶栏显示 WebSocket closed，页面保留最后快照。

## Data and API Changes

- `GET /api/overview`
  - 返回 `generatedAt`、`summary`、`nodes`。
  - `summary` 包含全局业务摘要和异常计数。
  - `nodes` 列表提供节点层卡片所需字段，以及当前选中节点首屏所需的轻量 agent 摘要。

- `GET /api/nodes/:nodeId`
  - 返回单节点详情、资源历史、完整 agent 列表。
  - 避免把所有节点的完整 agent timeline 一次性打到首页响应里。

- `GET /api/nodes/:nodeId/agents/:agentId/timeline?window=1h|24h`
  - 返回指定 agent 的最近事件序列。
  - 事件字段最少包含 `id`、`timestamp`、`type`、`summary`、`detail`、`status`。

- WebSocket `/ws`
  - 首帧：`dashboard.snapshot`
  - 增量：`node.delta`、`agent.delta`、`session.event`
  - 前端按主键 merge，不整树替换

- 修改 [frontend/src/types/dashboard.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/frontend/src/types/dashboard.ts)
  - 对齐真实 API contract，去掉纯 mock 字段，新增业务摘要、节点详情、agent 任务摘要和 timeline 事件结构。

## Task Breakdown

### Task 1: 定义后端监控契约和存储模型

**Files**
- Modify: [src/types.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/src/types.ts)
- Modify: [src/db/schema.sql](/Users/dysania/program/openclaw/projects/openclaw-dashboard/src/db/schema.sql)
- Modify: [src/db/repositories/telemetryRepository.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/src/db/repositories/telemetryRepository.ts)
- Create: [src/db/repositories/dashboardRepository.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/src/db/repositories/dashboardRepository.ts)

**Outcome**
- 当前态与短期历史的数据模型被固定下来，后续接口和前端可围绕同一 contract 开发。

### Task 2: 扩展 snapshot 采集与 timeline 事件生成

**Files**
- Modify: [src/services/rpcClient.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/src/services/rpcClient.ts)
- Modify: [src/services/nodeManager.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/src/services/nodeManager.ts)
- Modify: [src/services/eventBus.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/src/services/eventBus.ts)
- Modify: [src/services/wsGateway.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/src/services/wsGateway.ts)

**Outcome**
- 系统能从 OpenClaw 轮询结果里稳定生成“当前状态 + 短期历史 + 增量事件”三类数据。

### Task 3: 落地只读 REST 与 WebSocket 协议

**Files**
- Modify: [src/routes/nodes.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/src/routes/nodes.ts)
- Modify: [src/app.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/src/app.ts)
- Create: [tests/backend/routes.overview.test.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/tests/backend/routes.overview.test.ts)
- Create: [tests/backend/routes.timeline.test.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/tests/backend/routes.timeline.test.ts)
- Modify: [package.json](/Users/dysania/program/openclaw/projects/openclaw-dashboard/package.json)

**Outcome**
- 首页 bootstrap API、节点详情 API 和 agent timeline API 都有明确 contract，并且可以被自动化测试覆盖。

### Task 4: 接通前端数据层与选择状态

**Files**
- Modify: [frontend/src/types/dashboard.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/frontend/src/types/dashboard.ts)
- Modify: [frontend/src/hooks/useDashboardSocket.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/frontend/src/hooks/useDashboardSocket.ts)
- Modify: [frontend/src/app/App.tsx](/Users/dysania/program/openclaw/projects/openclaw-dashboard/frontend/src/app/App.tsx)
- Create: [frontend/src/lib/api.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/frontend/src/lib/api.ts)

**Outcome**
- 前端不再依赖纯 mock snapshot，能够消费真实 REST/WS 数据并保持选中节点、选中 agent 的交互一致性。

### Task 5: 实现双层首页与明细组件改造

**Files**
- Modify: [frontend/src/components/layout/Sidebar.tsx](/Users/dysania/program/openclaw/projects/openclaw-dashboard/frontend/src/components/layout/Sidebar.tsx)
- Modify: [frontend/src/components/layout/Topbar.tsx](/Users/dysania/program/openclaw/projects/openclaw-dashboard/frontend/src/components/layout/Topbar.tsx)
- Modify: [frontend/src/components/nodes/NodeOverview.tsx](/Users/dysania/program/openclaw/projects/openclaw-dashboard/frontend/src/components/nodes/NodeOverview.tsx)
- Modify: [frontend/src/components/charts/ResourceChart.tsx](/Users/dysania/program/openclaw/projects/openclaw-dashboard/frontend/src/components/charts/ResourceChart.tsx)
- Modify: [frontend/src/components/agents/AgentTable.tsx](/Users/dysania/program/openclaw/projects/openclaw-dashboard/frontend/src/components/agents/AgentTable.tsx)
- Modify: [frontend/src/components/agents/SessionHistoryPanel.tsx](/Users/dysania/program/openclaw/projects/openclaw-dashboard/frontend/src/components/agents/SessionHistoryPanel.tsx)
- Create: [frontend/src/components/summary/GlobalSummary.tsx](/Users/dysania/program/openclaw/projects/openclaw-dashboard/frontend/src/components/summary/GlobalSummary.tsx)

**Outcome**
- 页面真正变成“业务摘要 + 运维明细”的双层监控面板，而不是单纯节点卡片页。

### Task 6: 验证、文档与冒烟

**Files**
- Modify: [tests/smoke/startup.smoke.sh](/Users/dysania/program/openclaw/projects/openclaw-dashboard/tests/smoke/startup.smoke.sh)
- Modify: [frontend/README.md](/Users/dysania/program/openclaw/projects/openclaw-dashboard/frontend/README.md)
- Modify: [README.md](/Users/dysania/program/openclaw/projects/openclaw-dashboard/README.md)

**Outcome**
- 启动检查、接口契约说明和前端接入说明都与新面板一致，后续实现和验收不会靠口头记忆。

## Test Strategy

- 后端类型与编译检查
  - Run: `cd /Users/dysania/program/openclaw/projects/openclaw-dashboard && npm run check`
  - 目标：保证新增类型、路由和 repository 逻辑通过 TypeScript 校验。

- 前端构建检查
  - Run: `cd /Users/dysania/program/openclaw/projects/openclaw-dashboard/frontend && npm run build`
  - 目标：保证新的 dashboard state、组件改造和响应式布局至少能通过生产构建。

- 后端接口测试
  - 在 [package.json](/Users/dysania/program/openclaw/projects/openclaw-dashboard/package.json) 增加基于 Node 内置 test runner 的 `test` 脚本。
  - Run: `cd /Users/dysania/program/openclaw/projects/openclaw-dashboard && npm test`
  - 覆盖点：
    - `/api/overview` 返回 summary + nodes + agent 摘要
    - `/api/nodes/:id` 返回节点详情与资源历史
    - `/api/nodes/:id/agents/:agentId/timeline` 按 window 返回事件

- 端到端冒烟
  - Run: `cd /Users/dysania/program/openclaw/projects/openclaw-dashboard && tests/smoke/startup.smoke.sh`
  - 目标：确认后端健康、前端入口、真实 overview 页面都能拉起。

- 视觉验收
  - 在实现阶段使用浏览器验证桌面、平板、手机三组截图点。
  - 至少覆盖健康节点、降级节点、断线态、空 timeline 四类场景。

## Rollback Plan

- 数据库变更采用“新增列/新增表”方式，不重命名或删除现有表；如果新面板实现失败，可继续使用旧 `getOverview()` 结构与现有最简前端。
- REST 新接口采用增量方式添加；若新聚合接口不稳定，可先保留旧 `/api/overview` 响应并让前端回退到旧卡片视图。
- WebSocket 协议保留完整快照首帧；若增量事件 merge 有问题，可临时退回“周期性完整 snapshot”模式，牺牲带宽换稳定。
- 前端改造以现有组件为基础渐进替换；若新双层首页不可用，可回退到当前 [frontend/src/app/App.tsx](/Users/dysania/program/openclaw/projects/openclaw-dashboard/frontend/src/app/App.tsx) 的简版 overview 渲染。

## Risks and Mitigations

- 上游 OpenClaw RPC 不一定直接提供“任务摘要/阶段”
  - Mitigation: 在 `rpcClient` 中做降级映射，先显示会话状态与 sessionId，并把“更丰富任务摘要”标成可选增强项。

- 1 到 2 秒级刷新可能导致 SQLite 与 gateway 压力增加
  - Mitigation: 对历史写入做“仅变化时落库”，资源图按 bucket 聚合，必要时把采集间隔默认设为 2 秒而不是 1 秒。

- 前端如果对高频事件整树重渲染，会在 100+ agents 时明显卡顿
  - Mitigation: 首帧完整快照，后续增量 merge；agent 列表接入虚拟化，保持选中状态局部更新。

- 非技术同事与运维同事对信息密度要求不同
  - Mitigation: 通过双层首页处理，不做两套独立页面；先保证摘要语言可读、底层明细可下钻。

- 时间线字段命名和异常口径如果不统一，验收会持续发散
  - Mitigation: 在 Task 1 先固定 contract，并把异常定义、窗口大小、最近产出口径作为实现前 review 清单的一部分。
