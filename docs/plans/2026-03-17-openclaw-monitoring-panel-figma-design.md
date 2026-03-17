# OpenClaw Monitoring Panel Figma Design

## Goal

为只读监控面板先产出可评审的 Figma 设计基线，再进入真实前端实现。设计必须同时服务两类用户：

- 团队运维：快速定位离线节点、退化节点、拥塞 agent 和异常事件
- 非技术同事：快速理解现在有多少 agent 在工作、最近在做什么、是否有异常

## Visual Direction

这版设计不走通用暗色 admin 模板，而是采用 `Signal Desk` 方向：

- 背景以温暖纸色和浅砂渐变为主，避免“监控面板 = 黑底蓝边”的陈词滥调
- 数据容器使用深墨绿色和石墨色，形成“运营台 + 调度台”而不是“代码编辑器”观感
- 强调色使用铜金和青绿：
  - 铜金用于业务摘要、重点数字和结构分割
  - 青绿用于在线 / 活跃 / 正常
  - 琥珀用于 warning
  - 朱红用于 critical / offline
- 标题使用偏杂志感的衬线字族，正文和数据使用稳定的无衬线字族，拉开“摘要”和“明细”的阅读节奏

## Page Inventory

### Required Pages

| Page | Purpose | Required Variants |
|------|---------|-------------------|
| Dashboard Overview | 首页双层总览，先给业务摘要，再给节点与 agent 明细 | Desktop / Tablet / Mobile |
| Node Detail | 聚焦单节点的身份、资源趋势、agent 分布和最近异常 | Desktop / Mobile |
| Agent Work Detail / Timeline | 展示 agent 当前任务和 `1h/24h` 时间线 | Desktop / Tablet / Mobile |
| Alerts / Events | 展示 warning / critical / recovered 事件和明细 | Desktop / Mobile |

### Information Principles

- 首页第一屏先回答“系统现在好吗”“谁在忙”“有没有异常”
- 每个页面都保留节点和 agent 的所属关系，避免非技术用户迷失上下文
- 告警页不只展示红点，要明确告知是否恢复、影响到哪个节点、最近上下文是什么

## Design Tokens

| Token | Value | Usage |
|------|-------|-------|
| `--bg-canvas` | `#f3ede2` | 页面底色 |
| `--bg-panel` | `#123131` | 主面板底色 |
| `--bg-panel-2` | `#1b4140` | 次级面板底色 |
| `--bg-ghost` | `#ebe3d2` | 浅色卡片 / 纸色区域 |
| `--text-strong` | `#13201f` | 深色正文 |
| `--text-light` | `#f8f4ec` | 深色面板文字 |
| `--accent-brass` | `#b88a43` | 重点数字 / 分隔 / 标签 |
| `--accent-mint` | `#79c7a7` | online / healthy / success |
| `--accent-amber` | `#d9a85a` | warning |
| `--accent-red` | `#c9684d` | critical / offline |
| `--accent-sky` | `#8fb3c9` | 次级趋势线 / 信息提示 |
| `--radius-xl` | `28px` | 大容器 |
| `--radius-lg` | `20px` | 卡片 |
| `--radius-md` | `14px` | badge / 次级区块 |
| `--shadow-soft` | `0 20px 60px rgba(29, 33, 31, 0.12)` | 浮层 / 大卡片 |
| `--breakpoint-mobile` | `390px` | Mobile 设计基准 |
| `--breakpoint-tablet` | `1024px` | Tablet 设计基准 |
| `--breakpoint-desktop` | `1440px` | Desktop 设计基准 |

## Component Inventory

| Figma Component | Code Path | Status | Notes |
|-----------------|-----------|--------|-------|
| Node Rail | `frontend/src/components/layout/Sidebar.tsx` | Adapted | 节点列表改为更强状态表达 |
| Command Header | `frontend/src/components/layout/Topbar.tsx` | Adapted | 承担连接状态、刷新状态和全局提示 |
| Global Summary | `frontend/src/components/summary/GlobalSummary.tsx` | New | 业务摘要第一层 |
| Node Overview | `frontend/src/components/nodes/NodeOverview.tsx` | Adapted | 节点身份、心跳、消息统计 |
| Resource Trend | `frontend/src/components/charts/ResourceChart.tsx` | Adapted | 趋势区域改成更强可读性布局 |
| Agent Board | `frontend/src/components/agents/AgentTable.tsx` | Adapted | 列表要突出任务摘要和阶段 |
| Timeline Panel | `frontend/src/components/agents/SessionHistoryPanel.tsx` | Adapted | 强化阶段切换与持续时间 |
| Alerts Page | `frontend/src/app/AlertsPage.tsx` | New | 独立事件页 |
| Alert Filter Bar | `frontend/src/components/alerts/AlertFilterBar.tsx` | New | 告警筛选 |
| Alert Detail Panel | `frontend/src/components/alerts/AlertDetailPanel.tsx` | New | 告警详情 |
| Dashboard Skeleton | `frontend/src/components/states/DashboardSkeleton.tsx` | New | 首屏加载 |
| Empty State Panel | `frontend/src/components/states/EmptyStatePanel.tsx` | New | 空态 / 超时 / 无事件 |

## Local Prototype Source

- HTML source: [monitoring-panel.html](/Users/dysania/program/openclaw/.worktrees/codex-openclaw-monitoring-panel-delivery/projects/openclaw-dashboard/frontend/design-prototype/monitoring-panel.html)
- CSS source: [monitoring-panel.css](/Users/dysania/program/openclaw/.worktrees/codex-openclaw-monitoring-panel-delivery/projects/openclaw-dashboard/frontend/design-prototype/monitoring-panel.css)
- Suggested preview command:

```bash
cd /Users/dysania/program/openclaw/.worktrees/codex-openclaw-monitoring-panel-delivery/projects/openclaw-dashboard/frontend/design-prototype
python3 -m http.server 4173
```

- Local capture URL:

```text
http://127.0.0.1:4173/monitoring-panel.html
```

## Figma Handoff

当前状态：

- 本地高保真原型和 handoff 文档已完成
- 当前已通过 Figma MCP 成功把本地原型导入 Figma
- file URL / file key 已回填
- 部分关键 frame 的 node ID 已从 metadata 确认，剩余项继续补齐

### File

- Figma file URL: [OpenClaw Monitoring Panel Prototype](https://www.figma.com/design/YUEs7YciblbhlZI3DwCGHj)
- Figma file key: `YUEs7YciblbhlZI3DwCGHj`

### Key Frames

| Page | Variant | Figma URL | Node ID |
|------|---------|-----------|---------|
| Dashboard Overview | Desktop | [OpenClaw Monitoring Panel Prototype](https://www.figma.com/design/YUEs7YciblbhlZI3DwCGHj?node-id=1-28) | `1:28` |
| Dashboard Overview | Tablet | `TBD` | `TBD` |
| Dashboard Overview | Mobile | `TBD` | `TBD` |
| Node Detail | Desktop | `TBD` | `TBD` |
| Node Detail | Mobile | `TBD` | `TBD` |
| Agent Work Detail / Timeline | Desktop | `TBD` | `TBD` |
| Agent Work Detail / Timeline | Tablet | `TBD` | `TBD` |
| Agent Work Detail / Timeline | Mobile | [OpenClaw Monitoring Panel Prototype](https://www.figma.com/design/YUEs7YciblbhlZI3DwCGHj?node-id=1-842) | `1:842` |
| Alerts / Events | Desktop | [OpenClaw Monitoring Panel Prototype](https://www.figma.com/design/YUEs7YciblbhlZI3DwCGHj?node-id=1-878) | `1:878` |
| Alerts / Events | Mobile | [OpenClaw Monitoring Panel Prototype](https://www.figma.com/design/YUEs7YciblbhlZI3DwCGHj?node-id=1-1025) | `1:1025` |

### Capture Notes

- 设计基线来自本地静态高保真原型，而不是当前生产前端。
- Figma 中应保留 `Wireframes`、`Hi-Fi`、`Components`、`Tokens` 四个 page。
- 若导入后的 frame 结构需要整理，允许在 Figma 内重新排版，但不能改变关键布局与 token 定义。
- 实现阶段必须用最终批准的 frame / node ID 做 Figma MCP 对齐，不允许脱稿重画。
- 当前导入结果是单文件长画布；若后续在 Figma 内拆 page 或重构 frame，必须同步更新这里的 URL / node ID。

## Validation Checklist

- 首页第一屏同时出现业务摘要和节点运维明细
- Node Detail 页能看出单节点资源趋势和异常上下文
- Agent Detail 页能看出任务摘要、阶段、持续时长和时间线
- Alerts 页能同时覆盖 warning、critical、recovered 三类事件
- Desktop / Tablet / Mobile 变体齐全，且不是单纯缩放
