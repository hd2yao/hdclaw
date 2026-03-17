# OpenClaw VM 宿主机直装 + 本地 Qwen 直连 Runbook

> 适用场景：虚拟机作为长期运行节点，直接在 VM 宿主机安装 `openclaw`，默认模型走本地 Qwen，不在 VM 内再套 Docker 跑 OpenClaw。

## 目标

这份 runbook 解决的是下面这类部署需求：

- 虚拟机本身就是长期维护节点
- 需要直接在 VM 上看日志、改配置、查进程
- 不希望所有运维动作都绕一层 `docker exec`
- 模型走现有本地 OpenAI-compatible Qwen 服务
- 不启用 `sglang` adapter

当前已对齐的现网参考来自正在运行的 Docker 实例：

- 本地模型上游地址：`http://192.168.6.230:30000/v1`
- 本地模型 provider API：`openai-completions`
- 本地模型 ID：`/data/qwen3.5-27b`
- `OPENCLAW_LOCAL_TOOLCALL_ADAPTER=off`

## 为什么选宿主机直装

相比“VM 里再跑 Docker，再在 Docker 里跑 OpenClaw”，宿主机直装更适合这类节点：

- 运行时状态集中在 VM 宿主机
- `~/.openclaw`、日志、workspace 路径更直观
- 排障时不用先判断问题在宿主机还是容器
- 更容易接 systemd、备份、监控和定时任务

代价是这条路径不是当前仓库默认的 Docker-first 主路径，所以需要单独维护这份 runbook。

## 前置条件

推荐环境：

- Ubuntu 22.04 或 Debian 12
- 当前登录用户具备 `sudo`
- VM 能访问 `http://192.168.6.230:30000/v1`
- 已安装或可安装 `git`、`jq`、`ruby`

先安装基础依赖：

```bash
sudo apt-get update
sudo apt-get install -y git jq ruby curl
```

## 步骤 1：安装 OpenClaw

执行官方安装脚本：

```bash
curl -fsSL https://openclaw.ai/install.sh | bash
```

安装完成后执行初始化：

```bash
openclaw onboard --install-daemon
```

如果你希望 OpenClaw 以宿主机后台服务形式长期运行，这一步不要跳过。

## 步骤 2：验证基础运行

先确认 CLI 和 gateway 都正常：

```bash
openclaw --help
openclaw gateway status
openclaw health
openclaw dashboard --no-open
```

验收标准：

- `openclaw --help` 能正常输出
- `openclaw gateway status` 显示运行中
- `openclaw health` 不报基础错误
- `openclaw dashboard --no-open` 能返回一个可访问的地址

## 步骤 3：获取仓库并准备环境文件

```bash
git clone https://github.com/hd2yao/hdclaw.git ~/openclaw
cd ~/openclaw
cp .env.example .env.local
```

## 步骤 4：配置宿主机直连本地 Qwen

编辑 `.env.local`，至少配置下面这些值：

```bash
OPENCLAW_LLM_MODE=local
OPENCLAW_LOCAL_PROVIDER=local
OPENCLAW_LOCAL_MODEL_ID=/data/qwen3.5-27b
OPENCLAW_LOCAL_BASE_URL=http://192.168.6.230:30000/v1
OPENCLAW_LOCAL_API=openai-completions
OPENCLAW_LOCAL_API_KEY=local-noauth

OPENCLAW_LOCAL_TOOLCALL_ADAPTER=off
OPENCLAW_MEMORY_FLUSH_ENABLED=false
OPENCLAW_WEB_SEARCH_MODE=off
```

说明：

- `OPENCLAW_LOCAL_MODEL_ID` 使用 provider 暴露出来的原始模型 ID：`/data/qwen3.5-27b`
- 这里明确不启用 `sglang` adapter
- `OPENCLAW_WEB_SEARCH_MODE=off` 是为了先把主链路跑通，减少额外变量

## 步骤 5：同步仓库配置

```bash
make bootstrap
make sync
make install-skills
make verify
```

各命令作用：

- `make bootstrap`：检查宿主机依赖，要求本机已存在 `openclaw`、`jq`、`ruby`
- `make sync`：把仓库模板渲染到宿主机 `~/.openclaw/openclaw.json`
- `make install-skills`：把 skills 部署到宿主机 `~/.openclaw/skills`
- `make verify`：检查 gateway、health 和技能可用性

## 步骤 6：确认默认主模型切到本地 Qwen

先检查当前默认主模型：

```bash
openclaw models status --plain
```

如果输出已经是：

```text
local//data/qwen3.5-27b
```

就说明默认主模型已经正确切换。

如果输出的仍然是 OpenAI 模型，则手动切换：

```bash
openclaw config set agents.defaults.model.primary local//data/qwen3.5-27b
openclaw gateway restart
openclaw models status --plain
```

注意这里的值不是 `/data/qwen3.5-27b`，而是：

```text
local//data/qwen3.5-27b
```

这是 OpenClaw 在 provider model id 前面加了 `local/` 前缀后的引用形式。

## 步骤 7：验证模型链路

确认 OpenClaw 已经在用本地 Qwen：

```bash
openclaw models status --plain
openclaw gateway status
openclaw health
```

如果你有本地 CLI 测试入口，再补一次真实消息验证：

```bash
openclaw agent --local --message "你好，回复一句测试文本" --json
```

验收标准：

- `openclaw models status --plain` 返回 `local//data/qwen3.5-27b`
- gateway 运行正常
- health 正常
- 模型能返回正常文本回复

## 常用运维命令

```bash
make doctor
make status
make restart
openclaw logs --follow
openclaw health
openclaw models status --plain
```

## 已知坑

### 1. 不要混淆模型 ID 和主模型引用

这两个值不同：

- provider model id：`/data/qwen3.5-27b`
- OpenClaw 主模型引用：`local//data/qwen3.5-27b`

前者写进 `.env.local` 的 `OPENCLAW_LOCAL_MODEL_ID`。
后者用于 `agents.defaults.model.primary`。

### 2. 不要同时维护宿主机直装和 Docker 两套 OpenClaw

一旦两套环境同时存在，就容易出现：

- 宿主机 `~/.openclaw/openclaw.json` 一套
- 容器内 `/home/node/.openclaw/openclaw.json` 一套
- 你以为改的是当前实例，实际改到了另一套环境

这台 VM 如果决定走宿主机直装，就不要再把它当成 Docker OpenClaw 节点维护。

### 3. 不要先把 `web_search`、adapter、群聊路由全开

先把最小主链路跑通：

- OpenClaw 能启动
- 本地 Qwen 能连通
- 默认主模型已切到 Qwen

然后再逐项加功能。这样排障成本最低。

### 4. 先确认 VM 能访问上游 Qwen 服务

部署前先单独探测：

```bash
curl -fsS http://192.168.6.230:30000/v1/models
```

如果这一步不通，不要先怀疑 OpenClaw，先排查：

- VM 到上游 Qwen 服务的网络
- 端口是否开放
- 上游服务是否真的是 OpenAI-compatible `/v1`

## 回滚

如果这条宿主机直装路径需要回滚：

1. 查看 `~/.openclaw/backup/<timestamp>/openclaw.json`
2. 恢复目标配置文件
3. 重启 gateway

```bash
cp ~/.openclaw/backup/<timestamp>/openclaw.json ~/.openclaw/openclaw.json
openclaw gateway restart
```

如果是模型切换导致的问题，也可以直接改回 `.env.local` 后重新执行：

```bash
make sync
make restart
```

## 与当前 Docker 实例的关系

当前本机已有一个运行中的 Docker OpenClaw 实例，配置特征如下：

- 端口映射：`127.0.0.1:18890 -> 18789`
- 本地模型上游：`http://192.168.6.230:30000/v1`
- `OPENCLAW_LOCAL_TOOLCALL_ADAPTER=off`
- 本地 Qwen provider 已存在，但默认主模型仍是 OpenAI

这份 VM runbook 的目标，是在宿主机直装环境里复用同一条 Qwen 上游链路，但把默认主模型显式切到：

```text
local//data/qwen3.5-27b
```

这样可以减少迁移变量，又避免把 VM 运行时继续绑在 Docker 上。
