# Claude Plan Review - Round 03

## Findings
| ID | Severity | Section | Issue | Suggested Change |
|----|----------|---------|-------|------------------|
| C-R03-001 | Blocking | Backend Changes - nodeManager | Plan mentions modifying `src/services/eventBus.ts` in Task 2, but EventBus is not mentioned in Architecture section. The event bus integration strategy is unclear. | Add EventBus to Architecture section and clarify its role: does it sit between nodeManager and wsGateway? Is it for internal or client-facing events? |
| C-R03-002 | Blocking | Backend Changes - schema.sql | The proposed index `(node_id, agent_id, created_at DESC)` is insufficient for timeline queries with time window filters. Queries like `WHERE agent_id = ? AND created_at > ?` will miss this index. | Add composite index `(agent_id, created_at)` for timeline window queries. Consider `(node_id, created_at)` for node-level history. |
| C-R03-003 | Important | Data and API Changes | The plan references "当前任务摘要" / "当前阶段" fields from upstream but doesn't document what exact RPC response fields map to these. No fallback contract specified if fields are missing. | Add explicit field mapping table in rpcClient section: e.g., `session.metadata.task_title` → `taskSummary`, `session.current_stage` → `taskPhase`, with `N/A` or `session_id` as fallback. |
| C-R03-004 | Important | Task Breakdown - Task 2 | No error handling strategy when upstream OpenClaw RPC fails or returns malformed data. System will likely crash or propagate nulls. | Add error handling section: define fallback behavior (use last known state? mark node as degraded?), and log schema mismatches for debugging. |
| C-R03-005 | Important | Test Strategy | WebSocket functionality is not covered by tests. This is critical for the 1-2 second refresh requirement. | Add WebSocket test cases: connection establishment, snapshot reception, delta merge behavior, disconnect/reconnect handling. |
| C-R03-006 | Important | Architecture | SQLite write throughput at 1-2 second intervals with many agents could be problematic. No mention of write batching or throttling. | Add write batching strategy: collect changes in memory, flush every N seconds, or implement "only write on change" more aggressively (e.g., dedupe within 5s window). |
| C-R03-007 | Important | Rollback Plan | Database migration strategy is not defined. New columns are mentioned but no migration scripts. | Include schema migration file (e.g., `migrations/001_add_dashboard_tables.sql`) and document that migrations run on startup. |
| C-R03-008 | Minor | Backend Changes - dashboardRepository | Splitting telemetryRepository may add unnecessary complexity for MVP. Could instead extend telemetryRepository with dashboard-specific methods. | Consider keeping single repository if telemetryRepository is not huge, or document why separation is necessary. |
| C-R03-009 | Minor | Frontend Design - States | No loading skeleton or skeleton timeout specified for initial data fetch. | Add loading state with 5s timeout fallback, show last snapshot with "refreshing..." indicator. |
| C-R03-010 | Minor | Test Strategy | Missing load test for high agent count (100+). Plan mentions this as a risk but doesn't test for it. | Add simple load test: simulate 100 agents updating every 2s, verify WebSocket message rate and frontend render time. |

## Summary
- Blocking count: 2
- Important count: 5
- Minor count: 3
- Verdict: BLOCKED
