# OpenClaw Monorepo (Local Single Source of Truth)

本目录用于统一管理 OpenClaw 本机配置、开源 skills（固定版本/在线安装）与自定义 skills。

## 目录
- `config/`: 非敏感配置模板
- `skills/custom/`: 自定义 skills 源码
- `skills/vendor/`: 固定版本第三方 skills
- `skills/catalog.yaml`: 技能安装清单
- `legacy/clawra/`: 历史 `clawra` 项目快照（只读参考）
- `scripts/`: 初始化/同步/安装/验证脚本
- `tests/`: 配置与技能测试
- `docs/`: 架构、迁移、运维与 GitHub 治理文档

## 快速开始
```bash
make bootstrap
cp .env.example .env.local
# 编辑 .env.local，填入真实值
make sync
make install-skills
make verify
```

平台安装参考：

- Windows 安装：[`docs/openclaw-windows-install.md`](docs/openclaw-windows-install.md)
- Docker 全新实例：[`docs/openclaw-fresh-docker-oneclick.md`](docs/openclaw-fresh-docker-oneclick.md)
- 官方镜像方案：[`docs/openclaw-official-docker-oneclick.md`](docs/openclaw-official-docker-oneclick.md)

## 常用命令
```bash
make sync
make install-skills
make verify
make doctor
make restart
make status
make run-web-query QUERY="查看一下有关 AI 的最新新闻，给我10条"
```

## Docker（全新 OpenClaw，独立于本仓库配置）
当前提供两套容器模板：

- `containers/openclaw-fresh/`：从 `node:22-bookworm-slim` 开始，再用官方安装脚本安装 OpenClaw
- `containers/openclaw-official/`：直接基于官方 OpenClaw 镜像，再叠加你当前工作流需要的依赖

下面这组命令默认创建 `openclaw-fresh`：

```bash
make docker-build
make docker-up
make docker-shell
```

若后续新增多套容器模板，可切换目录名：

```bash
DOCKER_STACK=openclaw-fresh make docker-up
DOCKER_STACK=openclaw-official make docker-up
```

首次初始化（全新实例）建议直接在宿主机执行：

```bash
make docker-onboard
make docker-gateway-start
make docker-gateway-status
```

一键安装/配置（含工具权限、acpx、exec approvals、node host 启动）：

```bash
OPENCLAW_TELEGRAM_ALLOW_FROM=1871908422 make docker-fresh-bootstrap
```

完整步骤与踩坑见 [docs/openclaw-fresh-docker-oneclick.md](docs/openclaw-fresh-docker-oneclick.md)。

如果你想以官方镜像为基础来自定义自己的环境：

```bash
OPENCLAW_DASHBOARD_PORT=18890 DOCKER_STACK=openclaw-official make docker-build
OPENCLAW_DASHBOARD_PORT=18890 DOCKER_STACK=openclaw-official make docker-up
OPENCLAW_DASHBOARD_PORT=18890 OPENCLAW_TELEGRAM_ALLOW_FROM=1871908422 make docker-official-bootstrap
```

完整说明见 [docs/openclaw-official-docker-oneclick.md](docs/openclaw-official-docker-oneclick.md)。

如果 Docker 里的 Telegram bot 要接群聊，注意两点：

- Docker 实例不走本仓库的 `make sync`；Telegram 群策略要写到容器内 `~/.openclaw/openclaw.json`
- 常见最小配置是把 `channels.telegram.groupPolicy` 设为 `open`；如果仍使用 `allowlist`，则必须补 `groupAllowFrom`

常用容器命令：

```bash
make docker-logs
make docker-gateway-status
make docker-down
```

说明：
- 容器内 OpenClaw 数据目录是独立卷：`openclaw-home`（不会写入本机 `~/.openclaw`）。
- 容器内工作目录是独立卷：`openclaw-workspace`。
- `make docker-up` 后会自动启动网关（容器内前台模式，不依赖 systemd）。
- Dashboard 默认端口映射为 `http://127.0.0.1:18790/`（可通过 `OPENCLAW_DASHBOARD_PORT` 覆盖）。

## 每日 AI 热点自动化
配置 `.env.local`（至少包含 Telegram 目标）后：

```bash
make setup-ai-news-daily
```

手动触发一次：

```bash
make run-ai-news-daily-now
```

运行新增校验：

```bash
make test-ai-news-daily
```

完整流程说明见 [docs/ai-news-daily-runbook.md](docs/ai-news-daily-runbook.md)。

## 模型切换（OpenAI / 本地）
在 `.env.local` 中切换 `OPENCLAW_LLM_MODE` 后执行 `make sync`：

```bash
# 切回 OpenAI Codex
OPENCLAW_LLM_MODE=openai-codex
OPENCLAW_OPENAI_MODEL=openai-codex/gpt-5.3-codex
# 可选：给 OpenAI 模型注入原生检索参数
OPENCLAW_OPENAI_MODEL_PARAMS_JSON='{"tools":[{"type":"web_search_preview"}]}'

# 切到本地 OpenAI-compatible 服务
OPENCLAW_LLM_MODE=local
OPENCLAW_LOCAL_PROVIDER=local
OPENCLAW_LOCAL_MODEL_ID=my-local-model
OPENCLAW_LOCAL_BASE_URL=http://127.0.0.1:1234/v1
OPENCLAW_LOCAL_API=openai-completions
OPENCLAW_LOCAL_API_KEY=local-noauth
# 不使用 Brave key 时建议关闭 web_search（避免 missing_brave_api_key）
OPENCLAW_WEB_SEARCH_MODE=off

# 可选：SGLang 工具调用适配（把 <tool_call> 转换为标准 tool_calls）
OPENCLAW_LOCAL_TOOLCALL_ADAPTER=sglang
OPENCLAW_LOCAL_TOOLCALL_ADAPTER_BASE_URL=http://127.0.0.1:31001/v1
# 可选：是否启用预压缩 memory flush（适配模式默认会自动关闭）
OPENCLAW_MEMORY_FLUSH_ENABLED=false

# 如需启用 OpenClaw 内置 web_search（Brave）
OPENCLAW_WEB_SEARCH_MODE=brave
OPENCLAW_WEB_SEARCH_API_KEY=your-brave-key
```

```bash
make sync
openclaw models status --plain
```

## 本地模型无 key 联网检索
当 `OPENCLAW_WEB_SEARCH_MODE=off` 时，`web_search` 会关闭（不再触发 Brave key 报错）。

统一路由（推荐）：

```bash
node skills/custom/search-router/scripts/search-router.mjs --query "OpenAI latest news" --max 10
```

该路由固定顺序为：
1. 模型原生检索（可用时）
2. tavily-search
3. keyless-search
4. Brave key（最后兜底）

仍可单独调用：

```bash
node skills/custom/tavily-search/scripts/tavily-search.mjs --query "OpenAI latest news" --max 5
node skills/custom/keyless-search/scripts/keyless-search.mjs --query "OpenAI latest news" --max 5
```

安装并检查 skill：

```bash
make install-skills
openclaw skills info search-router
openclaw skills info tavily-search
openclaw skills info keyless-search
make test-no-brave-search
```

## 强制检索入口（推荐）
为避免模型直接“凭记忆回答”，可使用统一入口：

```bash
make run-web-query QUERY="查看一下有关 AI 的最新新闻，给我10条"
```

该入口会先执行 `search-router`，并按固定顺序尝试：
1. 模型原生检索
2. tavily-search
3. keyless-search
4. Brave key（最后兜底）

## SGLang 适配代理（推荐）
当 SGLang 返回文本 `<tool_call>` 而不是标准 `tool_calls` 时，先启动本地适配代理：

```bash
SGLANG_UPSTREAM_BASE_URL=http://192.168.6.230:30000/v1 \
SGLANG_ADAPTER_HOST=127.0.0.1 \
SGLANG_ADAPTER_PORT=31001 \
SGLANG_ADAPTER_STREAM_MODE=proxy \
SGLANG_ADAPTER_STREAM_FALLBACK=on \
node scripts/sglang-toolcall-adapter.mjs
```

然后在 `.env.local` 设置：
- `OPENCLAW_LOCAL_TOOLCALL_ADAPTER=sglang`
- `OPENCLAW_LOCAL_TOOLCALL_ADAPTER_BASE_URL=http://127.0.0.1:31001/v1`

最后执行：

```bash
make sync
make restart
```

如需把 adapter 做成可复用的 macOS 后台服务，可直接安装仓库内模板：

```bash
SGLANG_UPSTREAM_BASE_URL=http://192.168.6.230:30000/v1 \
SGLANG_ADAPTER_HOST=127.0.0.1 \
SGLANG_ADAPTER_PORT=31001 \
bash scripts/install-sglang-adapter-service.sh
```

卸载：

```bash
bash scripts/uninstall-sglang-adapter-service.sh
```

如果只想渲染 plist 而不注册 `launchd`，可加：

```bash
OPENCLAW_SKIP_LAUNCHCTL=1
```

验证 adapter 流式与兼容行为：

```bash
make test-adapter
```

跑 20 次延迟样本并输出 P50/P90：

```bash
bash tests/adapter/latency-benchmark.sh
```
## 网关地址
- Dashboard: `http://127.0.0.1:18789/`

## 注意
- `.env.local` 不入库。
- 密钥只放 `.env.local` 和本机 `~/.openclaw/openclaw.json`。
- GitHub 治理开关见 `docs/github-hardening.md`。
