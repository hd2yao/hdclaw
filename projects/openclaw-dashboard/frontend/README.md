# OpenClaw Dashboard Frontend

React + TypeScript + TailwindCSS + Recharts 前端骨架，用于监控多个 OpenClaw 节点与 agents。

## 1. 页面布局设计（ASCII 线框图）

```text
┌────────────────────────── Sidebar / Node Fleet ──────────────────────────┬──────────────────────── Main Content ─────────────────────────────────────┐
│ OpenClaw Nodes                                                           │ Topbar: Search | WebSocket status | Alerts                                │
│ ┌──────────────────────────────────────────────────────────────────────┐  ├───────────────────────────────────────────────────────────────────────────┤
│ │ Singapore Gateway                            [online]               │  │ Node Overview                                                            │
│ │ Agents 98/124                    Load 64%                          │  │ ┌───────────────────────────────┬──────────────────────────────────────┐ │
│ └──────────────────────────────────────────────────────────────────────┘  │ │ Node identity + endpoint        │ Message stats / heartbeat            │ │
│ ┌──────────────────────────────────────────────────────────────────────┐  │ └───────────────────────────────┴──────────────────────────────────────┘ │
│ │ Frankfurt Edge                              [degraded]             │  │                                                                           │
│ │ Agents 76/112                    Load 81%                          │  │ Resource Trend (CPU / Memory line-area chart)                            │
│ └──────────────────────────────────────────────────────────────────────┘  │ ┌───────────────────────────────────────────────────────────────────────┐ │
│ ┌──────────────────────────────────────────────────────────────────────┐  │ │                                                                       │ │
│ │ Virginia Core                               [offline]              │  │ │                             Recharts Panel                            │ │
│ │ Agents 0/109                     Load 0%                           │  │ │                                                                       │ │
│ └──────────────────────────────────────────────────────────────────────┘  │ └───────────────────────────────────────────────────────────────────────┘ │
│                                                                          │                                                                           │
│                                                                          │ ┌──────────────────────────────┬──────────────────────────────────────┐ │
│                                                                          │ │ Agent Table (100+ agents)    │ Session History / Timeline          │ │
│                                                                          │ │ virtualized rows             │ selected agent events               │ │
│                                                                          │ └──────────────────────────────┴──────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┴───────────────────────────────────────────────────────────────────────────┘
```

## 2. 组件结构树

```text
App
├── Sidebar
│   └── NodeCard[]
├── Topbar
├── NodeOverview
│   ├── StatusBadge
│   └── MetricCard[]
├── ResourceChart
├── AgentTable
│   ├── AgentRow[]
│   └── StatusBadge
└── SessionHistoryPanel
    ├── SessionEventCard[]
    └── StatusBadge

Hooks / Data Layer
└── useDashboardSocket
    ├── WebSocket connect / reconnect
    ├── snapshot merge
    ├── selectedNode / selectedAgent derivation
    └── session history binding
```

## 3. 关键组件代码示例

### `useDashboardSocket.ts`
- 负责 WebSocket 连接、断线重连、消息 merge。
- 当前用 mock snapshot 兜底，方便脱离后端先开发 UI。

### `AgentTable.tsx`
- 已为 100+ agents 场景预留：
  - 固定表头
  - 可滚动列表
  - 下一步接入 `@tanstack/react-virtual`

### `ResourceChart.tsx`
- 使用 Recharts 渲染 CPU / Memory 双 area chart。

## 4. WebSocket 数据同步方案

### 推荐消息模型

```json
{
  "type": "dashboard.snapshot",
  "generatedAt": "2026-03-16T09:54:00.000Z",
  "nodes": []
}
```

```json
{
  "type": "node.delta",
  "nodeId": "node-sg-01",
  "patch": {
    "status": "degraded",
    "cpu": 82,
    "memory": 79,
    "lastHeartbeat": "2026-03-16T09:54:03.000Z"
  }
}
```

```json
{
  "type": "agent.delta",
  "nodeId": "node-sg-01",
  "agentId": "sg-agent-2",
  "patch": {
    "status": "running",
    "messages": { "sent": 120, "received": 128, "errors": 0 },
    "updatedAt": "2026-03-16T09:54:05.000Z"
  }
}
```

```json
{
  "type": "session.event",
  "nodeId": "node-sg-01",
  "agentId": "sg-agent-2",
  "event": {
    "id": "evt-77",
    "timestamp": "2026-03-16T09:54:08.000Z",
    "type": "message",
    "summary": "User replied",
    "detail": "Need additional chart filters",
    "status": "running"
  }
}
```

### 同步策略

1. **首次连接**：后端推完整 `dashboard.snapshot`
2. **增量更新**：后续只推 `node.delta` / `agent.delta` / `session.event`
3. **前端 merge**：按 `nodeId`、`agentId` 精确更新，避免整个树重渲染
4. **断线重连**：客户端指数退避重连；重连成功后请求最新 snapshot
5. **高频图表**：资源历史建议服务端聚合成 1s/5s bucket，别把原始点洪水一样砸给浏览器
6. **100+ agents 列表**：必须虚拟滚动，否则不是监控，是在测试浏览器极限

## 目录

```text
frontend/
├── index.html
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── tsconfig.json
├── vite.config.ts
└── src/
    ├── app/App.tsx
    ├── components/
    │   ├── agents/
    │   ├── charts/
    │   ├── layout/
    │   ├── nodes/
    │   └── states/
    ├── hooks/useDashboardSocket.ts
    ├── lib/utils.ts
    ├── mocks/dashboard-data.ts
    ├── styles.css
    ├── main.tsx
    └── types/dashboard.ts
```

## 启动

```bash
cd frontend
npm install
npm run dev
```

## 下一步

- 接入真实 backend WebSocket 协议
- Agent 表格替换为虚拟列表
- 增加筛选器（node / status / role / error only）
- 加入消息吞吐量图、session duration 图、异常告警抽屉

现实一点：仪表盘最容易死在“数据太多还想一次全画出来”。先保证信息分层，再谈炫技。