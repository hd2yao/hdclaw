# OpenClaw Readonly Monitoring Panel Implementation Plan

## Goal

基于仓库现有 `projects/openclaw-dashboard` 后端与前端骨架，交付一个只读监控面板 MVP，支持以 `OpenClaw 节点 -> agents -> 任务时间线` 的层级方式展示系统状态，并同时满足团队运维和非技术同事的查看需求。

## Scope

- 保留只读定位，不增加任何写操作或控制入口。
- 首页采用双层结构：顶部业务摘要，主体区域为运维明细。
- 支持多个 OpenClaw 节点实例接入，并按节点展示下属 agents。
- 支持 1 到 2 秒级的状态刷新体验。
- 支持短期历史，MVP 先明确为最近 `1h` 与 `24h` 两档窗口。
- 展示任务时间线、当前阶段、开始时间、持续时间和最近进展摘要。
- 不展示模型原始思考、完整会话正文或工具调用参数。
- 继续复用现有 `projects/openclaw-dashboard`，不新开第二套 dashboard 项目。

## Architecture

- 后端继续采用 `Express + SQLite + WebSocket` 架构，`NodeManager` 负责轮询 OpenClaw gateway 并持久化当前态与短期历史。
- 内部事件流明确为：
  - `OpenClawRpcClient` 负责把上游 RPC 响应归一化为 snapshot。
  - `NodeManager` 负责比较前后 snapshot、标记节点健康、生成 timeline 事件。
  - `eventBus` 只做后端内部事件分发，不直接暴露给前端。
  - `wsGateway` 订阅 `eventBus`，把内部事件转换为前端可消费的 `dashboard.snapshot`、`node.delta`、`agent.delta`、`session.event`。
- 数据链路优先沿用现有 `status`、`agents.list`、`sessions.list` 三个 RPC；若后续节点侧提供单次 `dashboard.snapshot` 聚合 RPC，则只替换 `rpcClient` 适配层，不改上层存储与 API。
- 当前态数据继续写入 `nodes`、`agents`、`sessions`、`message_counters`、`resource_snapshots`；任务时间线新增专用历史表，避免全部压进 `events.payload_json` 后难以查询。
- 为控制 SQLite 压力，写入策略明确为：
  - `agents` / `sessions` 仅在 snapshot 字段有变化时更新。
  - `agent_timeline_events` 对相同 `agent_id + summary + status` 在 5 秒窗口内去重。
  - `resource_snapshots` 只按 5 秒 bucket 写入一次，而不是每次轮询都写。
- REST 负责页面首屏引导和按需查询，WebSocket `/ws` 负责推送完整快照和增量更新，保持 payload 可序列化且可局部 merge。
- 数据库升级采用“基线 schema + 增量 migration”模式：
  - `src/db/schema.sql` 维护全新安装的最终结构。
  - `src/db/migrations/*.sql` 负责升级现有 SQLite 文件。
  - `src/db/init.ts` 负责按顺序执行未应用 migration。
- 前端在已有组件骨架上做“真实数据接线 + 信息分层”，优先复用 `frontend/src/components/*` 与 `frontend/src/hooks/useDashboardSocket.ts`，避免推倒重来。

## Backend Changes

- 修改 [src/types.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/src/types.ts)
  - 为节点、agent、任务时间线定义明确的监控 DTO。
  - 补充 `DashboardOverviewResponse`、`DashboardNodeDetail`、`AgentTimelineEvent`、`DashboardSummary`、`DashboardSnapshotEvent` 等类型。
  - 扩展 `AgentSnapshot` 与 `SessionSnapshot`，加入 `taskSummary`、`taskPhase`、`taskStartedAt`、`lastProgressAt`、`staleReason` 等字段。

- 修改 [src/db/schema.sql](/Users/dysania/program/openclaw/projects/openclaw-dashboard/src/db/schema.sql)
  - 为 `agents` 表增加 `task_summary`、`task_phase`、`task_started_at`、`last_progress_at`、`stale_reason`。
  - 新增 `agent_timeline_events` 表，保存 `node_id`、`agent_id`、`session_id`、`event_type`、`summary`、`detail`、`status`、`created_at`。
  - 为 timeline 查询增加索引：
    - `(agent_id, created_at DESC)` 用于 `agent + time window`
    - `(node_id, created_at DESC)` 用于 `node + time window`
    - `(node_id, agent_id, created_at DESC)` 用于节点内 agent 明细排序

- 新增 [src/db/migrations/001_readonly_monitoring_panel.sql](/Users/dysania/program/openclaw/projects/openclaw-dashboard/src/db/migrations/001_readonly_monitoring_panel.sql)
  - 为已存在数据库增量添加上述列、表和索引。
  - 保持 migration 仅做追加，不删除旧结构。

- 修改 [src/db/init.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/src/db/init.ts)
  - 初始化 `schema_migrations` 表。
  - 在执行 `schema.sql` 后扫描 `src/db/migrations/*.sql` 并按文件名顺序执行未应用脚本。

- 修改 [src/db/repositories/telemetryRepository.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/src/db/repositories/telemetryRepository.ts)
  - 继续作为 MVP 唯一 repository，避免再拆 `dashboardRepository`。
  - 让 `replaceAgents`、`replaceSessions` 写入扩展字段。
  - 新增 `appendAgentTimelineEvents`、`getDashboardOverview`、`getNodeDetail`、`getAgentTimeline`、`getLastKnownNodeState`。

- 修改 [src/services/rpcClient.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/src/services/rpcClient.ts)
  - 规范化 `status`、`agents.list`、`sessions.list` 返回值到统一 snapshot 模型。
  - 明确当前字段映射与降级策略：
    - `sessions.list[].sessionId` -> `sessionId`
    - `sessions.list[].kind` -> `taskPhase`，缺失时回退到 `'running'`
    - `sessions.list[].updatedAt` -> `lastProgressAt`
    - `sessions.list[].key` -> `taskSummary` 的首选降级值
    - 若 `taskSummary` 仍不可得，则回退到 `sessionId`
    - `taskStartedAt` 在上游未提供时先置 `null`
    - `status.health.agents[].sessions.path` -> `workspace`
  - 若后续上游补 richer metadata，则仅在 adapter 内扩展提取顺序，不改 API contract。

- 修改 [src/services/nodeManager.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/src/services/nodeManager.ts)
  - 在每次轮询时比较前后两次 snapshot，生成节点状态变化、agent 状态变化与 timeline 事件。
  - 当 RPC 失败或返回异常结构时：
    - 节点标记为 `degraded`
    - REST overview 继续使用最后一次成功快照
    - 写入一条 `session.event` / `system` 类型历史，摘要为 schema mismatch 或 polling failure
    - 记录结构化日志，避免因单节点坏数据拖垮整个服务
  - 对 timeline 写入做 5 秒去重窗口，避免同一事件被每轮轮询重复落库。

- 修改 [src/services/eventBus.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/src/services/eventBus.ts)
  - 明确内部事件类型，区分 `telemetry.snapshot.ready`、`node.state.changed`、`agent.state.changed`、`timeline.event.created`。

- 修改 [src/services/wsGateway.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/src/services/wsGateway.ts)
  - 首次连接先发送完整 `dashboard.snapshot`。
  - 后续基于 `eventBus` 推增量事件。
  - 对外只发送前端 contract，避免把内部 event 结构直接透出。

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
- 初始加载显示 skeleton；如果 5 秒内首屏数据未返回，则切换为明确的超时空态。
- 若已经拿到过旧快照但正在刷新，则继续显示旧数据，并在顶栏展示 `refreshing...` / `stale` 指示。
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
- WebSocket 连接状态、刷新状态与错误提示放入 `aria-live="polite"` 区域。

### Validation Screenshot Points

- 桌面端：3 个节点、1 个 degraded、1 个 offline、至少 1 个 busy agent。
- 桌面端：选中某 agent 后时间线面板显示 5 条内事件。
- 平板端：摘要与节点详情堆叠时不出现横向滚动。
- 手机端：节点切换、agent 列表和 timeline 抽屉可正常操作。
- 断线态：顶栏显示 WebSocket closed，页面保留最后快照。
- 超时态：显示 skeleton -> timeout fallback -> 手动重试入口。

## Data and API Changes

- `GET /api/overview`
  - 返回 `generatedAt`、`summary`、`nodes`。
  - `summary` 包含全局业务摘要、异常计数与 stale 计数。
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
  - 重连成功后重新拉一次完整 `dashboard.snapshot`

- 修改 [frontend/src/types/dashboard.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/frontend/src/types/dashboard.ts)
  - 对齐真实 API contract，新增业务摘要、节点详情、agent 任务摘要和 timeline 事件结构。

## Task Breakdown

### Task 1: 固定存储模型与 migration 入口

**Files**
- Modify: [src/types.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/src/types.ts)
- Modify: [src/db/schema.sql](/Users/dysania/program/openclaw/projects/openclaw-dashboard/src/db/schema.sql)
- Modify: [src/db/init.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/src/db/init.ts)
- Create: [src/db/migrations/001_readonly_monitoring_panel.sql](/Users/dysania/program/openclaw/projects/openclaw-dashboard/src/db/migrations/001_readonly_monitoring_panel.sql)
- Modify: [src/db/repositories/telemetryRepository.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/src/db/repositories/telemetryRepository.ts)

**Outcome**
- 全新安装和存量数据库升级都能得到同一份可查询 schema。

### Task 2: 扩展 snapshot 归一化、容错和内部事件流

**Files**
- Modify: [src/services/rpcClient.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/src/services/rpcClient.ts)
- Modify: [src/services/nodeManager.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/src/services/nodeManager.ts)
- Modify: [src/services/eventBus.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/src/services/eventBus.ts)
- Modify: [src/services/wsGateway.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/src/services/wsGateway.ts)

**Outcome**
- 系统能从 OpenClaw 轮询结果里稳定生成“当前状态 + 短期历史 + 增量事件”，并在坏数据场景下退化而不崩溃。

### Task 3: 落地只读 REST / WS 协议与自动化测试

**Files**
- Modify: [src/routes/nodes.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/src/routes/nodes.ts)
- Modify: [src/app.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/src/app.ts)
- Modify: [package.json](/Users/dysania/program/openclaw/projects/openclaw-dashboard/package.json)
- Create: [tests/backend/routes.overview.test.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/tests/backend/routes.overview.test.ts)
- Create: [tests/backend/routes.timeline.test.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/tests/backend/routes.timeline.test.ts)
- Create: [tests/backend/ws.gateway.test.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/tests/backend/ws.gateway.test.ts)
- Create: [tests/backend/nodeManager.resilience.test.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/tests/backend/nodeManager.resilience.test.ts)

**Outcome**
- overview、timeline、WebSocket 连接与重连、坏数据退化路径都具备自动化覆盖。

### Task 4: 接通前端数据层与加载/陈旧状态

**Files**
- Modify: [frontend/src/types/dashboard.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/frontend/src/types/dashboard.ts)
- Modify: [frontend/src/hooks/useDashboardSocket.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/frontend/src/hooks/useDashboardSocket.ts)
- Modify: [frontend/src/app/App.tsx](/Users/dysania/program/openclaw/projects/openclaw-dashboard/frontend/src/app/App.tsx)
- Create: [frontend/src/lib/api.ts](/Users/dysania/program/openclaw/projects/openclaw-dashboard/frontend/src/lib/api.ts)
- Create: [frontend/src/components/states/DashboardSkeleton.tsx](/Users/dysania/program/openclaw/projects/openclaw-dashboard/frontend/src/components/states/DashboardSkeleton.tsx)

**Outcome**
- 前端不再依赖纯 mock snapshot，能够消费真实 REST/WS 数据，并处理 loading、timeout、stale snapshot 三类状态。

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

### Task 6: 压测、文档与冒烟

**Files**
- Modify: [tests/smoke/startup.smoke.sh](/Users/dysania/program/openclaw/projects/openclaw-dashboard/tests/smoke/startup.smoke.sh)
- Create: [tests/load/dashboard-100-agents.smoke.mjs](/Users/dysania/program/openclaw/projects/openclaw-dashboard/tests/load/dashboard-100-agents.smoke.mjs)
- Modify: [frontend/README.md](/Users/dysania/program/openclaw/projects/openclaw-dashboard/frontend/README.md)
- Modify: [README.md](/Users/dysania/program/openclaw/projects/openclaw-dashboard/README.md)

**Outcome**
- 启动检查、100+ agents 压测入口、接口契约说明和前端接入说明都与新面板一致。

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
    - `/api/nodes/:id/agents/:agentId/timeline` 按窗口返回事件
    - `/ws` 首次连接收到 `dashboard.snapshot`
    - `/ws` 能收到 `node.delta` / `agent.delta` / `session.event`
    - WebSocket 断连重连后能重新同步 snapshot
    - 上游 RPC 报错或 malformed payload 时节点退化但服务不崩溃

- 压测脚本
  - Run: `node /Users/dysania/program/openclaw/projects/openclaw-dashboard/tests/load/dashboard-100-agents.smoke.mjs`
  - 目标：模拟 100 agents、2 秒刷新，验证广播速率与基础渲染路径不过载。

- 端到端冒烟
  - Run: `cd /Users/dysania/program/openclaw/projects/openclaw-dashboard && tests/smoke/startup.smoke.sh`
  - 目标：确认后端健康、前端入口、真实 overview 页面都能拉起。

- 视觉验收
  - 在实现阶段使用浏览器验证桌面、平板、手机三组截图点。
  - 至少覆盖健康节点、降级节点、断线态、超时态、空 timeline 五类场景。

## Rollback Plan

- 数据库升级只允许追加列、表和索引；旧代码应能忽略这些新增结构并继续启动。
- migration 执行前先备份 `projects/openclaw-dashboard/data/dashboard.db`；若新代码不可用，可回退到前一版本代码并恢复备份数据库。
- 若 migration 已执行但不想恢复备份，也可直接回退应用代码，因为新增结构不影响旧 `/api/overview` 和旧前端运行。
- 若新的 WebSocket 增量 merge 不稳定，可临时退回“连接即发完整 snapshot + 5 秒轮询刷新”模式，牺牲实时性换稳定。
- 若双层首页交互影响上线，可先保留新的后端 contract，只让前端回退到旧简版 overview 布局。

## Risks and Mitigations

- 上游 OpenClaw RPC 不一定直接提供“任务摘要/阶段”
  - Mitigation: 在 `rpcClient` 中先使用现有字段做明确降级，缺失时显示 `sessionId` 和 `kind`，不阻塞 MVP。

- 1 到 2 秒级刷新可能导致 SQLite 与 gateway 压力增加
  - Mitigation: 使用 5 秒去重窗口和 resource bucket 写入，避免每轮无差别落库。

- 前端如果对高频事件整树重渲染，会在 100+ agents 时明显卡顿
  - Mitigation: 首帧完整快照，后续增量 merge；agent 列表后续可接虚拟化，先用压测脚本把 100+ agents 场景跑通。

- 非技术同事与运维同事对信息密度要求不同
  - Mitigation: 通过双层首页处理，不做两套独立页面；先保证摘要语言可读、底层明细可下钻。

- 时间线字段命名和异常口径如果不统一，验收会持续发散
  - Mitigation: 在 Task 1 固定 contract，并把异常定义、窗口大小、最近产出口径写入接口返回说明。

## Review Log

| ID | Severity | Comment | Decision | Notes | Status |
|----|----------|---------|----------|-------|--------|
| C-R03-001 | Blocking | Architecture 未说明 eventBus 角色 | Accept | 在 Architecture 中明确 `rpcClient -> nodeManager -> eventBus -> wsGateway` 链路 | Resolved |
| C-R03-002 | Blocking | timeline 索引不足 | Accept | 补充 `(agent_id, created_at)` 与 `(node_id, created_at)` 索引 | Resolved |
| C-R03-003 | Important | 任务字段映射不清楚 | Accept | 在 `rpcClient` 段落补字段映射和降级顺序 | Resolved |
| C-R03-004 | Important | 缺少上游错误处理策略 | Accept | 在 `nodeManager` 段落补 degraded、last known snapshot 和日志策略 | Resolved |
| C-R03-005 | Important | WS 测试缺失 | Accept | 在 Task 3/Test Strategy 中增加 `ws.gateway` 与重连测试 | Resolved |
| C-R03-006 | Important | SQLite 写入节流不清晰 | Accept | 在 Architecture 中补 5 秒去重窗口与 resource bucket 策略 | Resolved |
| C-R03-007 | Important | migration 策略未定义 | Accept | 增加 `src/db/migrations/001_readonly_monitoring_panel.sql` 与 `init.ts` 改造 | Resolved |
| C-R03-008 | Minor | dashboardRepository 可能过度设计 | Accept | v2 删除 `dashboardRepository`，MVP 延续 `telemetryRepository` | Resolved |
| C-R03-009 | Minor | 缺少 skeleton / timeout 策略 | Accept | 在前端状态里增加 skeleton、5 秒 timeout 和 stale 提示 | Resolved |
| C-R03-010 | Minor | 缺少 100+ agents 压测 | Accept | 新增 `tests/load/dashboard-100-agents.smoke.mjs` | Resolved |
