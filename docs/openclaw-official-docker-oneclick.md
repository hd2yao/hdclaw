# OpenClaw Official Image Variant

这套模板用于：

- 保留当前 `openclaw-fresh` 容器不动
- 改为以**官方 OpenClaw 镜像**为基础
- 再叠加你当前已经验证过的自定义层

当前实现方式：

- 基础镜像：`ghcr.io/openclaw/openclaw:latest`
- 自定义层：
  - `python3` / `pip3`
  - Playwright 运行库
  - `sudo` 免密
  - `openclaw-container-init`
  - `sglang-toolcall-adapter.mjs`
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

Gateway 在 Docker 中仍会保留 token 认证，所以直接打开裸地址时，浏览器可能会显示 `device identity required` 或 `Disconnected from gateway`。
正确做法是先输出宿主机可直接打开的 URL：

```bash
DOCKER_STACK=openclaw-official OPENCLAW_DASHBOARD_PORT=18890 make docker-dashboard-url
```

进入容器：

```bash
DOCKER_STACK=openclaw-official make docker-shell
```

## 一键配置

```bash
cd /Users/dysania/program/openclaw
OPENCLAW_DASHBOARD_PORT=18890 \
OPENCLAW_TELEGRAM_ALLOW_FROM=1871908422 \
make docker-official-bootstrap
```

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

## 与 openclaw-fresh 的区别

`openclaw-fresh`：

- 从 `node:22-bookworm-slim` 开始
- 再用官方安装脚本安装 OpenClaw

`openclaw-official`：

- 直接从官方 OpenClaw 镜像开始
- 只追加你当前工作流需要的依赖和脚本

## 适合的用法

这套更适合你后续自己维护：

1. 先跟官方镜像版本走
2. 再把你自己的依赖逐层加进去
3. 避免再出现“官方运行时一套、本地 curl 安装一套”的版本混装问题
