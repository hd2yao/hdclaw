# Codex Resolution - Round 03

## Inputs

- Plan reviewed: [openclaw-readonly-monitoring-panel.plan.v1.md](/Users/dysania/program/openclaw/openclaw-readonly-monitoring-panel.plan.v1.md)
- Claude review: [round-03.claude.md](/Users/dysania/program/openclaw/reviews/round-03.claude.md)
- Updated plan: [openclaw-readonly-monitoring-panel.plan.v2.md](/Users/dysania/program/openclaw/openclaw-readonly-monitoring-panel.plan.v2.md)

## Review Log

| ID | Severity | Comment | Decision | Notes | Status |
|----|----------|---------|----------|-------|--------|
| C-R03-001 | Blocking | Architecture 未说明 eventBus 角色 | Accept | 在 v2 Architecture 中明确 `rpcClient -> nodeManager -> eventBus -> wsGateway`，并说明 eventBus 仅用于内部事件分发 | Resolved |
| C-R03-002 | Blocking | timeline 索引不足，无法支撑 window 查询 | Accept | 在 v2 的 `schema.sql` / migration 设计中补充 `(agent_id, created_at DESC)`、`(node_id, created_at DESC)`、`(node_id, agent_id, created_at DESC)` | Resolved |
| C-R03-003 | Important | 当前任务摘要/阶段的上游字段映射不明确 | Accept | 在 v2 `rpcClient` 段落加入字段映射与降级顺序，明确 `sessionId`、`kind`、`updatedAt`、`key` 的映射方式 | Resolved |
| C-R03-004 | Important | 上游 RPC 失败或 malformed payload 时的策略缺失 | Accept | 在 v2 `nodeManager` 段落加入 degraded、继续用 last known snapshot、记录 system timeline event 和结构化日志 | Resolved |
| C-R03-005 | Important | WebSocket 行为没有自动化测试 | Accept | 在 v2 Task 3 / Test Strategy 中新增 `tests/backend/ws.gateway.test.ts`，并覆盖 snapshot、delta、disconnect/reconnect | Resolved |
| C-R03-006 | Important | 1-2 秒刷新可能造成 SQLite 写压 | Accept | 在 v2 Architecture 中定义 5 秒去重窗口和资源快照 bucket 写入策略 | Resolved |
| C-R03-007 | Important | 没有 migration 文件与升级路径 | Accept | 在 v2 中新增 `src/db/migrations/001_readonly_monitoring_panel.sql` 并要求 `src/db/init.ts` 执行未应用 migration | Resolved |
| C-R03-008 | Minor | 单独拆 `dashboardRepository` 可能过度设计 | Accept | v2 移除了 `dashboardRepository`，MVP 先扩展 `telemetryRepository` | Resolved |
| C-R03-009 | Minor | 缺少 skeleton / timeout / stale UX 定义 | Accept | v2 Frontend Design 与 Task 4 中补充 skeleton、5 秒 timeout 和 stale 提示 | Resolved |
| C-R03-010 | Minor | 缺少 100+ agents 压测 | Accept | v2 Task 6 / Test Strategy 中增加 `tests/load/dashboard-100-agents.smoke.mjs` | Resolved |

## Outcome

- Blocking: 0
- Important: 0 unresolved
- Minor: 0 unresolved
- Decision: Ready for next review or implementation
