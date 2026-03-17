# OpenClaw Dashboard Migration Design

**Date:** 2026-03-17

## Goal

将当前仅存在于 `openclaw-official-openclaw-1` 容器工作区内的 dashboard 项目迁移到本仓库，作为独立子项目在宿主机启动，并连接到运行在 `openclaw-official-openclaw-1` 中的 OpenClaw gateway 做真实验证。

## Current State

- 现有项目路径在容器内：`/home/node/.openclaw/workspace/projects/openclaw-dashboard`
- 项目包含独立 backend、frontend、Dockerfile 和 `docker-compose.yml`
- 该项目并未纳入当前仓库管理
- 容器内当前没有稳定运行的 dashboard 进程
- 前端启动日志显示缺失 `vite` 与 `@vitejs/plugin-react`
- 后端曾经运行，但日志中存在 websocket 广播和 telemetry 落库相关错误

## Scope

本次只做“迁移并修好可用”：

- 将现有 dashboard 代码完整迁入当前仓库
- 修复宿主机本地启动链路
- 修复最小必要的后端逻辑问题，使其可以连接并轮询 OpenClaw 节点
- 补充本仓库内的启动说明与验证步骤

本次不做：

- 大规模重构
- 与现有 `openclaw-official` compose 深度耦合
- UI 风格重做

## Target Layout

建议目录：

```text
projects/openclaw-dashboard/
  backend or existing root backend files
  frontend/
  docker/
  docker-compose.yml
  README.md
```

保留项目当前分层，优先让其能独立运行，而不是重新设计为仓库级共享服务。

## Runtime Model

宿主机运行 dashboard，OpenClaw 节点继续运行在 Docker 容器内。

- OpenClaw gateway 入口使用宿主机映射端口：`http://127.0.0.1:18890/`
- Dashboard backend 在宿主机本地监听 `3000`
- Dashboard frontend 在宿主机本地监听 `5173`

这样避免直接依赖容器 bridge IP，例如 `172.17.x.x` 或 `172.24.x.x`。

## Main Risks

### 1. 宿主机与容器入口混淆

以前的访问地址指向容器内部 IP，不适合作为浏览器入口。迁移后统一以宿主机 `127.0.0.1` 端口访问。

### 2. 前端依赖不完整

当前 `frontend/package.json` 声明了 Vite 依赖，但容器里的安装状态不完整，导致 dev server 无法启动。迁移后需要重新安装并验证锁文件与依赖一致性。

### 3. 后端与真实 OpenClaw snapshot 结构不匹配

日志显示 `Missing named parameter "agentId"`，说明 telemetry 入库逻辑与实际数据结构不一致。需要针对真实节点快照修正映射和持久化。

### 4. WebSocket 广播序列化问题

日志显示广播时出现循环引用对象 JSON 序列化失败。需要确保只广播可序列化 payload。

## Validation Criteria

- `projects/openclaw-dashboard` 可以在宿主机完成依赖安装
- backend 与 frontend 都能成功启动
- 浏览器可打开 dashboard
- dashboard 可注册并连接 `openclaw-official-openclaw-1` 对应的 OpenClaw 节点
- 可观察到至少一个节点的基础信息、总览或 agents 数据

## Recommended Approach

采用“原样迁移 + 最小修复”的策略：

1. 先完整拷贝现有项目到仓库
2. 用测试或可重复命令先稳定复现问题
3. 逐步修复前端依赖、后端适配和启动文档
4. 在宿主机接入真实容器节点完成端到端验证

这是当前风险最低、交付速度最快的路线。
