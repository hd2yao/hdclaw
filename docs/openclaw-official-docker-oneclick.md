# OpenClaw Official Image Variant

这套模板用于：

- 以**官方 OpenClaw 镜像**为基础
- 再叠加你当前已经验证过的自定义层

当前实现方式：

- 基础镜像：`ghcr.io/openclaw/openclaw:latest`
- 自定义层：
  - `gh` CLI
  - `python3` / `pip3`
  - Playwright 运行库
  - `sudo` 免密
  - `openclaw-container-init`
  - `sglang-toolcall-adapter.mjs`（仅在显式启用 adapter 时使用）
  - Obsidian 挂载

## Telegram 轮询稳定性

`openclaw-official` 默认会写入以下 Telegram 网络参数：

- `channels.telegram.network.autoSelectFamily=false`
- `channels.telegram.network.dnsResultOrder=ipv4first`

这组参数用于降低 Docker 中 Telegram polling 出现 `Polling stall detected` 的概率。

## 启动

```bash
cd /Users/dysania/program/openclaw
DOCKER_STACK=openclaw-official make docker-build
DOCKER_STACK=openclaw-official OPENCLAW_DASHBOARD_PORT=18890 make docker-up
```

Dashboard 端口只绑定到本机回环地址：

- `http://127.0.0.1:18890/`
- `http://localhost:18890/`

Gateway 在 Docker 中仍会保留 token 认证，但 bootstrap 现在会在宿主机固定保存一个 token 文件，不会因为容器重建而漂移。

默认 token 文件：

- `~/.openclaw-docker/openclaw-official.gateway-token`

GitHub CLI 登录态也会持久化到：

- `/home/node/.config/gh`

所以在容器里只需要登录一次，后续重建容器也不会丢。

推荐流程：

1. 固定只用 `http://127.0.0.1:18890/`
2. 第一次进入 Dashboard 时，在右上角 Control UI 设置里粘一次 token
3. 容器启动时会自动修补 Control UI 的本地设置逻辑，同一浏览器 + 同一 origin 下，后续刷新页面和重启容器都应继续保留这个 token

如果你是在这次修复前就已经打开过 Dashboard，浏览器里可能还留着旧的无 token 本地状态。最简单的处理是：

1. 在 `http://127.0.0.1:18890/` 重新录一次 token
2. 之后固定只用 `127.0.0.1:18890`

不要混用：

- `127.0.0.1:18890`
- `localhost:18890`

这两个是不同 origin，本地存储互不共享，看起来会像“重启后 token 丢了”。

如果你需要自助查看当前固定 token：

```bash
DOCKER_STACK=openclaw-official OPENCLAW_DASHBOARD_PORT=18890 make docker-dashboard-token
```

保留的 `docker-dashboard-url` 只是应急入口。只有在浏览器本地 token 还没录入时，才需要输出带 token 的 URL：

```bash
DOCKER_STACK=openclaw-official OPENCLAW_DASHBOARD_PORT=18890 make docker-dashboard-url
```

进入容器：

```bash
DOCKER_STACK=openclaw-official make docker-shell
```

GitHub 登录：

```bash
DOCKER_STACK=openclaw-official make docker-gh-auth
DOCKER_STACK=openclaw-official make docker-gh-status
```

推荐优先走 `gh auth`，不要把 SSH key 临时写进容器层。当前模板不会持久化 `/home/node/.ssh`，但会持久化 `/home/node/.config/gh`。

## 一键配置

```bash
cd /Users/dysania/program/openclaw
OPENCLAW_DASHBOARD_PORT=18890 \
OPENCLAW_TELEGRAM_ALLOW_FROM=1871908422 \
make docker-official-bootstrap
```

如果你希望显式指定固定 token，而不是使用宿主机默认 token 文件：

```bash
OPENCLAW_GATEWAY_TOKEN=your-own-stable-token \
OPENCLAW_DASHBOARD_PORT=18890 \
OPENCLAW_TELEGRAM_ALLOW_FROM=1871908422 \
make docker-official-bootstrap
```

## 一个 bot，两个 agent，两个 Telegram 群

如果你想：

- 同一个 Telegram bot
- GPT 一个群
- Qwen 一个群
- 两条会话互不干扰

这套 `official` bootstrap 已经支持。

先准备两个群 ID：

```bash
docker exec openclaw-official-openclaw-1 sh -lc 'openclaw channels logs --channel telegram'
```

看到群消息后，记录群 `chat_id`，通常形如 `-1001234567890`。

然后执行：

```bash
cd /Users/dysania/program/openclaw
OPENCLAW_DASHBOARD_PORT=18890 \
OPENCLAW_TELEGRAM_ALLOW_FROM=1871908422 \
OPENCLAW_TELEGRAM_GPT_GROUP_ID=-1001111111111 \
OPENCLAW_TELEGRAM_QWEN_GROUP_ID=-1002222222222 \
make docker-official-bootstrap
```

默认会创建两个 agent：

- `telegram-gpt` -> `openai-codex/gpt-5.3-codex`
- `telegram-qwen` -> `local//data/qwen3.5-27b`

并保留 `main` 作为默认 agent：

- 私聊和未命中的路由继续走 `main`
- 只有你指定的两个群会被精确绑定到 `telegram-gpt` / `telegram-qwen`

并自动写入：

- `agents.list`
- `bindings`
- `channels.telegram.groupAllowFrom`
- `channels.telegram.groups.<chatId>`

默认群内仍要求 `@bot` 提及才回复，这样更安全。如果你希望专用群里不需要提及：

```bash
OPENCLAW_TELEGRAM_GROUP_REQUIRE_MENTION=false \
OPENCLAW_TELEGRAM_ALLOW_FROM=1871908422 \
OPENCLAW_TELEGRAM_GPT_GROUP_ID=-1001111111111 \
OPENCLAW_TELEGRAM_QWEN_GROUP_ID=-1002222222222 \
make docker-official-bootstrap
```

可覆盖 agent id / 模型：

```bash
OPENCLAW_TELEGRAM_GPT_AGENT_ID=team-gpt \
OPENCLAW_TELEGRAM_QWEN_AGENT_ID=team-qwen \
OPENCLAW_TELEGRAM_GPT_MODEL=openai-codex/gpt-5.3-codex \
OPENCLAW_TELEGRAM_QWEN_MODEL=local//data/qwen3.5-27b \
make docker-official-bootstrap
```

注意：

- 这只解决“不同群路由到不同 agent”的问题。
- `qwen` 群是否稳定，仍取决于本地模型服务本身是否稳定。
- 如果 `qwen` 群需要 Tavily 检索，还要把 `TAVILY_API_KEY` 注入容器。

## 可覆盖官方镜像 tag

默认值：

```bash
OPENCLAW_OFFICIAL_IMAGE=ghcr.io/openclaw/openclaw:latest
OPENCLAW_APT_MIRROR=mirrors.tuna.tsinghua.edu.cn
```

例如固定 tag：

```bash
OPENCLAW_OFFICIAL_IMAGE=ghcr.io/openclaw/openclaw:2026.3.8 \
DOCKER_STACK=openclaw-official make docker-build
```

如果你本地网络对默认 Debian 源不稳定，可以显式覆盖：

```bash
OPENCLAW_APT_MIRROR=mirrors.tuna.tsinghua.edu.cn \
DOCKER_STACK=openclaw-official make docker-build
```

## 适合的用法

这套更适合你后续自己维护：

1. 先跟官方镜像版本走
2. 再把你自己的依赖逐层加进去
3. 避免再出现“官方运行时一套、本地 curl 安装一套”的版本混装问题
