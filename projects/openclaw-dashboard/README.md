# OpenClaw Dashboard Backend

多节点监控的真正难点，不是“把数据展示出来”，而是**在 100+ agents / 节点、多个节点并发、连接抖动、状态快速变化时，依然让数据流保持稳定、可追踪、可恢复**。这个骨架围绕这个现实设计。

## 目标

- 连接多个 OpenClaw 节点（WebSocket RPC）
- 周期采集 gateway / agents / sessions / resources / message counters
- 持久化到 SQLite
- 对前端提供 REST 查询接口
- 通过 WebSocket 推送实时事件

## 系统架构图

```text
                         +-----------------------------+
                         |        Frontend UI          |
                         | React/Vue Dashboard         |
                         +-------------+---------------+
                                       |
                        REST /api/*    |    WebSocket /ws
                                       |
+-------------------------------------------------------------------+
|                    OpenClaw Dashboard Backend                      |
|-------------------------------------------------------------------|
|  Express REST API        WebSocket Gateway        Auth Middleware  |
|          |                       |                         |        |
|          +-----------+-----------+-------------------------+        |
|                      |                                            |
|               +------+--------------------+                       |
|               |     Event Bus             |                       |
|               +------+--------------------+                       |
|                      |                                            |
|      +---------------+------------------+                         |
|      | Node Manager / Scheduler         |                         |
|      | - connection registry            |                         |
|      | - heartbeat / polling            |                         |
|      | - reconnect backoff              |                         |
|      +---------------+------------------+                         |
|                      |                                            |
|          +-----------+------------+                               |
|          | OpenClaw RPC Clients   |                               |
|          +-----------+------------+                               |
|                      |                                            |
|        ws://node-a:18789   ws://node-b:18789   ws://node-n:18789  |
+----------------------+-------------+------------------------------+
                       |             |                               
             +---------+--+   +------+-------+                       
             | OpenClaw  |   | OpenClaw     |      ...              
             | Node A    |   | Node B       |                       
             +------------+  +--------------+                       
                       |
                       v
                +--------------+
                | SQLite (WAL) |
                | snapshots    |
                | agents       |
                | sessions     |
                | events       |
                +--------------+
```

## 组件说明

### 1. Node Manager
- 维护节点注册表
- 启动周期采集任务
- 处理节点状态：`disconnected -> connecting -> connected -> degraded`
- 负责心跳超时、断线重连、指数退避

### 2. RPC Client Adapter
- 负责与 OpenClaw 节点的 WebSocket RPC 通信
- 当前提供协议适配占位层，后续只需要把真实 RPC method 名补进去
- 推荐按“批量拉取快照”模式获取数据，减少高频多请求放大效应

### 3. Telemetry Repository
- 将实时数据落 SQLite
- agents / sessions 使用 replace-snapshot 模式保持当前态
- gateway/resources/events 保留时序快照，支持趋势图与审计

### 4. Event Bus + WebSocket Gateway
- 后端内部统一事件分发
- 前端通过 `/ws` 订阅实时更新
- 事件适合推“变化”，REST 负责拉“当前聚合视图”

## API 设计

### REST

#### `GET /api/health`
返回服务存活状态。

#### `GET /api/nodes`
返回已注册节点列表。

响应：
```json
{
  "items": [
    {
      "id": "uuid",
      "name": "prod-hk-01",
      "url": "ws://10.0.0.3:18789",
      "status": "connected",
      "lastSeenAt": "2026-03-16T09:00:00.000Z",
      "reconnectAttempt": 0
    }
  ]
}
```

#### `POST /api/nodes`
注册一个新节点。

请求：
```json
{
  "name": "prod-hk-01",
  "url": "ws://10.0.0.3:18789",
  "token": "node-api-token"
}
```

#### `GET /api/overview`
返回聚合总览：节点状态、agent 状态统计、session 状态统计、最新资源数据。

> 建议后续继续补：
- `GET /api/nodes/:id`
- `GET /api/nodes/:id/agents`
- `GET /api/nodes/:id/sessions`
- `GET /api/nodes/:id/resources?from=&to=`
- `GET /api/events?nodeId=&type=&limit=`

### WebSocket Events

连接地址：`/ws`

事件格式：
```json
{
  "type": "telemetry.snapshot",
  "ts": "2026-03-16T09:00:00.000Z",
  "payload": {}
}
```

建议事件清单：
- `system.ready`
- `node.registered`
- `node.connected`
- `node.degraded`
- `node.disconnected`
- `telemetry.snapshot`
- `agent.status.changed`
- `session.queue.changed`
- `message.counter.updated`

## SQLite 数据模型

见：`src/db/schema.sql`

核心表：
- `nodes`
- `gateway_snapshots`
- `resource_snapshots`
- `agents`
- `sessions`
- `message_counters`
- `events`

### 建模原则
- **当前态**：`agents` / `sessions` / `message_counters`
- **时序态**：`gateway_snapshots` / `resource_snapshots` / `events`
- SQLite 开启 WAL，允许读写并发更平滑

## 多节点接入方案

### 连接管理
- 每个节点对应一个 `RegisteredNode`
- Node Manager 维护本地内存态 + DB 持久化态
- 服务重启后从 `nodes` 表恢复节点列表

### 心跳 / 采集
- 默认每 5 秒采集一次
- 推荐真实协议里提供一个聚合 RPC：
  - `gateway.status`
  - `agents.list`
  - `sessions.list`
  - `system.resources`
  - `messages.stats`
- 更好的现实方案：节点侧提供 `dashboard.snapshot` 单一 RPC，后端一次拉全量

### 断线重连
- 首次失败：1s
- 然后指数退避：2s / 4s / 8s ...
- 上限：30s
- 如果超过心跳超时未更新，标记为 `degraded`
- 连续恢复后重置退避计数

### 为什么这样设计
因为“每个指标一个独立长连接”这种写法看起来优雅，实际上只是更快地把自己写进事故复盘。单节点 100+ agents 时，**批量快照 + 本地聚合 + 增量广播** 才是成年人方案。

## 安全考虑

### 1. Dashboard API Token
- 所有 `/api/*`（除 health）默认走 Bearer Token
- 环境变量：`DASHBOARD_API_TOKEN`

### 2. 节点认证
- 每个节点存独立 token
- 连接节点时通过 header 传递 `Authorization: Bearer <token>`
- 不要全局复用一个万能 token，万能通常等于万一被盗全盘裸奔

### 3. 最小权限
- Dashboard 对节点只需要“读取监控信息”的权限
- 不要给 dashboard 写操作权限，除非你打算让监控面板顺手变成事故生成器

### 4. 网络隔离
- 节点 RPC 建议部署在内网 / Tailscale / VPN 后面
- 若暴露公网，至少要求：
  - TLS (`wss://`)
  - token 认证
  - IP allowlist
  - 速率限制

### 5. 审计
- 所有关键状态变化写入 `events`
- 所有 node 注册操作建议单独记录管理员身份与来源 IP

## 目录结构

```text
src/
  auth.ts
  app.ts
  index.ts
  config.ts
  logger.ts
  types.ts
  db/
    client.ts
    init.ts
    schema.sql
    repositories/
      nodeRepository.ts
      telemetryRepository.ts
  routes/
    health.ts
    nodes.ts
  services/
    eventBus.ts
    wsGateway.ts
    rpcClient.ts
    nodeManager.ts
  utils/
    time.ts
```

## 启动

```bash
cp .env.example .env
npm install
npm run dev
```

### 宿主机本地开发

这个仓库里的迁移版默认按“宿主机起前后端，接入 Docker 里的 OpenClaw 节点”来跑。不要再访问容器内部 `172.17.x.x` 地址，浏览器应访问宿主机端口。

1. 后端

```bash
cd /Users/dysania/program/openclaw/projects/openclaw-dashboard
cp .env.example .env
npm install
PORT=3000 DASHBOARD_API_TOKEN=dev-key-for-testing DASHBOARD_DB_PATH=./data/dashboard.db npm run dev
```

2. 前端

```bash
cd /Users/dysania/program/openclaw/projects/openclaw-dashboard/frontend
cp .env.example .env
npm install
npm run dev -- --host 127.0.0.1
```

3. 浏览器访问

```text
http://127.0.0.1:5173
```

### 接入 `openclaw-official-openclaw-1`

先拿到 OpenClaw dashboard URL 里的长 token，再把节点注册进 dashboard 后端：

```bash
docker exec openclaw-official-openclaw-1 openclaw dashboard --no-open
```

上面的命令会输出一个类似下面的 URL：

```text
http://127.0.0.1:18890/?token=...
```

把 `token=` 后面的完整值填进下面命令：

```bash
curl -X POST http://127.0.0.1:3000/api/nodes \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer dev-key-for-testing' \
  -d '{
    "name": "openclaw-official-openclaw-1",
    "url": "ws://127.0.0.1:18890",
    "token": "PASTE_DASHBOARD_URL_TOKEN_HERE"
  }'
```

验证 overview：

```bash
curl -H 'Authorization: Bearer dev-key-for-testing' \
  http://127.0.0.1:3000/api/overview
```

如果返回节点状态 `online` 且包含 agents 列表，说明 dashboard 已经成功接入当前 Docker 里的 OpenClaw。

## 下一步建议

1. 把 `OpenClawRpcClient` 换成真实 OpenClaw JSON-RPC method 调用
2. 为 overview 增加分页与时间范围过滤
3. 增加 agent/session 差异比对，发更细粒度 WebSocket 事件
4. 增加 retention job，定期清理旧 snapshots
5. 若节点规模继续扩大，再考虑把 SQLite 热数据迁到 Timeseries/ClickHouse；别一上来就过度工程，很多人只是喜欢为未来不存在的问题烧今天的时间
