# Runbook

## 当前默认部署模型

当前仓库默认以 `openclaw-official` Docker 容器作为本机运行时。

- 推荐路径：Docker-first
- 宿主机直装 `openclaw`：历史/可选，不再代表当前本机状态

## 首次初始化（Docker-first）
```bash
cp .env.example .env.local
# 编辑 .env.local，填入真实密钥
DOCKER_STACK=openclaw-official make docker-build
DOCKER_STACK=openclaw-official OPENCLAW_DASHBOARD_PORT=18890 make docker-up
OPENCLAW_DASHBOARD_PORT=18890 make docker-official-bootstrap
DOCKER_STACK=openclaw-official make docker-gateway-status
```

## 日常操作（Docker-first）
```bash
make docker-logs
make docker-shell
make docker-gateway-status
make docker-down
```

## 切换模型后端（OpenAI / 本地）
1. 修改 `.env.local` 中以下变量：
   - `OPENCLAW_LLM_MODE=openai-codex`（OpenAI）或 `OPENCLAW_LLM_MODE=local`（本地）
   - 本地模式补充：`OPENCLAW_LOCAL_PROVIDER`、`OPENCLAW_LOCAL_MODEL_ID`、`OPENCLAW_LOCAL_BASE_URL`、`OPENCLAW_LOCAL_API`、`OPENCLAW_LOCAL_API_KEY`
   - 无 Brave key 场景建议：`OPENCLAW_WEB_SEARCH_MODE=off`
   - 如需启用内置 web_search：`OPENCLAW_WEB_SEARCH_MODE=brave` + `OPENCLAW_WEB_SEARCH_API_KEY=...`
   - SGLang 文本工具调用适配（可选）：`OPENCLAW_LOCAL_TOOLCALL_ADAPTER=sglang`、`OPENCLAW_LOCAL_TOOLCALL_ADAPTER_BASE_URL`
2. 执行 `OPENCLAW_DASHBOARD_PORT=18890 make docker-official-bootstrap`。
3. 执行 `DOCKER_STACK=openclaw-official make docker-shell`，在容器内运行 `openclaw models status --plain` 确认当前主模型。

## 本地模型无 Brave key 的联网检索

这部分命令默认针对历史宿主机方案。Docker-first 实例如需接入同样逻辑，优先通过容器内配置或自定义镜像扩展后再执行。

1. 设置 `.env.local`：
   - `OPENCLAW_LLM_MODE=local`
   - `OPENCLAW_WEB_SEARCH_MODE=off`
   - （可选，推荐）`TAVILY_API_KEY=...`
2. 执行：
```bash
make sync
make install-skills
```
3. 检查：
```bash
openclaw config get tools.web.search --json
openclaw skills info tavily-search
openclaw skills info keyless-search
```
4. 联网检索：
```bash
node skills/custom/tavily-search/scripts/tavily-search.mjs --query "OpenAI latest news" --max 5
# 如无 Tavily key，再使用下列兜底路径
node skills/custom/keyless-search/scripts/keyless-search.mjs --query "OpenAI latest news" --max 5
```

## SGLang 工具调用兼容（`<tool_call>` -> `tool_calls`）
1. 启动适配代理（前台）：
```bash
SGLANG_UPSTREAM_BASE_URL=http://192.168.6.230:30000/v1 \
SGLANG_ADAPTER_HOST=127.0.0.1 \
SGLANG_ADAPTER_PORT=31001 \
SGLANG_ADAPTER_STREAM_MODE=proxy \
SGLANG_ADAPTER_STREAM_FALLBACK=on \
node scripts/sglang-toolcall-adapter.mjs
```
2. 在 `.env.local` 中设置：
   - `OPENCLAW_LOCAL_TOOLCALL_ADAPTER=sglang`
   - `OPENCLAW_LOCAL_TOOLCALL_ADAPTER_BASE_URL=http://127.0.0.1:31001/v1`
3. Docker-first 路径下执行 `OPENCLAW_DASHBOARD_PORT=18890 make docker-official-bootstrap`；历史宿主机路径下执行 `make sync && make restart`。
4. 用 `openclaw agent --local --to +15550001111 --message "给我最新十条美国金融资讯" --json` 验证返回内容不再是原始 `<tool_call>` 文本。
5. 运行 adapter 验证脚本：`make test-adapter`。
6. 需要压测时运行：`bash tests/adapter/latency-benchmark.sh`。

## SGLang adapter 服务模板（macOS launchd）
1. 安装后台服务：
```bash
SGLANG_UPSTREAM_BASE_URL=http://192.168.6.230:30000/v1 \
SGLANG_ADAPTER_HOST=127.0.0.1 \
SGLANG_ADAPTER_PORT=31001 \
bash scripts/install-sglang-adapter-service.sh
```
2. 只渲染 plist、不注册系统服务：
```bash
OPENCLAW_SKIP_LAUNCHCTL=1 bash scripts/install-sglang-adapter-service.sh
```
3. 卸载：
```bash
bash scripts/uninstall-sglang-adapter-service.sh
```
4. 模板位置：
   - `templates/launchd/ai.openclaw.sglang-adapter.plist.template`
5. 关键可覆盖变量：
   - `SGLANG_UPSTREAM_BASE_URL`
   - `SGLANG_ADAPTER_HOST`
   - `SGLANG_ADAPTER_PORT`
   - `SGLANG_ADAPTER_WORKDIR`
   - `OPENCLAW_SKIP_LAUNCHCTL`

## adapter 回滚
1. 前台运行场景（临时回滚到 legacy）：
```bash
SGLANG_ADAPTER_STREAM_MODE=legacy node scripts/sglang-toolcall-adapter.mjs
```
2. launchd 场景（持久回滚）：
```bash
plutil -replace EnvironmentVariables.SGLANG_ADAPTER_STREAM_MODE -string legacy ~/Library/LaunchAgents/ai.openclaw.sglang-adapter.plist
launchctl bootout gui/$UID ~/Library/LaunchAgents/ai.openclaw.sglang-adapter.plist || true
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/ai.openclaw.sglang-adapter.plist
launchctl kickstart -k gui/$UID/ai.openclaw.sglang-adapter
```

## 网关控制
```bash
DOCKER_STACK=openclaw-official make docker-gateway-status
docker compose -f containers/openclaw-official/docker-compose.yml exec openclaw openclaw gateway restart
docker compose -f containers/openclaw-official/docker-compose.yml exec openclaw openclaw health
```

## Session / Gateway Watchdog

新增了一个宿主机侧 watchdog 脚本：

```bash
make watchdog-status
make watchdog-run
```

行为约定：

1. 正在对话中
   - 脚本会读取 `main` 的最新 Telegram 私聊 session，计算上下文占比。
   - 达到阈值时只提示，不会自动切会话。
   - 默认阈值：
     - `70%`：提示你考虑 `/compact`
     - `85%+` 且已 compact 过，或连续 timeout：提示你考虑 `/new`

2. 长时间无人处理
   - 如果 session 已经不活跃，且命中高风险条件（上下文过重或连续 timeout），脚本会自动把旧 session 从 `sessions.json` 中移除，并把旧 transcript 备份成 `.reset.*`。
   - 下一条 Telegram 消息会自然落到新 session。

3. Telegram 假在线
   - 如果 `probe.ok=true` 但 `lastInboundAt` 长时间不更新，脚本优先尝试重拉容器内的 `openclaw-gateway` 前台进程。
   - 只有轻量恢复失败时，才会升级到容器重启。

4. 通知
   - 活跃对话中的阈值提示：默认通过本机通知 + Telegram bot 消息提示你手动 `/compact` 或 `/new`
   - 自动 `new session` / 自动重启 gateway：执行后也会发通知

常用环境变量：

```bash
OPENCLAW_WATCHDOG_SESSION_KEY='agent:main:telegram:direct:1871908422'
OPENCLAW_WATCHDOG_WARN_PERCENT=70
OPENCLAW_WATCHDOG_HIGH_PERCENT=85
OPENCLAW_WATCHDOG_CRITICAL_PERCENT=92
OPENCLAW_WATCHDOG_ACTIVE_WINDOW_MINUTES=10
OPENCLAW_WATCHDOG_STALL_MINUTES=45
OPENCLAW_WATCHDOG_TIMEOUT_THRESHOLD=2
```

注意：

- `openclaw gateway restart` 在当前 Docker 容器里不是可靠恢复手段，因为 service 模式未安装。
- watchdog 的“自动 compact”目前没有直接调用 OpenClaw 内部 compaction 命令，而是：
  - 活跃对话中提醒你手动发 `/compact`
  - 长时间无人处理时自动执行 `new session`

## Telegram 绑定
完整流程见 `docs/telegram-binding.md`。

当前这套配置的关键点：

1. 私聊默认走 `pairing`
2. 群聊默认是 `allowlist`
3. Docker-first 路径下，Telegram token 写入容器内运行配置；宿主机 `make sync` 不管理这部分状态

## 故障排查
```bash
make docker-logs
docker compose -f containers/openclaw-official/docker-compose.yml exec openclaw openclaw health
```

## 密钥轮换
1. 修改 `.env.local` 中对应变量。
2. 执行 `OPENCLAW_DASHBOARD_PORT=18890 make docker-official-bootstrap`。
3. 执行 `DOCKER_STACK=openclaw-official make docker-gateway-status` 确认运行正常。
4. 如需强制生效，再执行 `docker compose -f containers/openclaw-official/docker-compose.yml exec openclaw openclaw gateway restart`。

## 回滚配置
1. Docker-first 路径下，优先恢复 `openclaw-home` volume 备份，或回退 `OPENCLAW_OFFICIAL_IMAGE` tag 后重建容器。
2. 如只回退当前 bootstrap 结果，修改 `.env.local` 后重新执行 `OPENCLAW_DASHBOARD_PORT=18890 make docker-official-bootstrap`。
3. 历史宿主机路径才使用 `~/.openclaw/backup/<timestamp>/openclaw.json` 覆盖回滚。

## 历史宿主机流程（可选）

仅当你明确要维护不走 Docker 的单独节点时，才使用下面这套旧流程：

```bash
make bootstrap
cp .env.example .env.local
make sync
make install-skills
make verify
```

## GitHub 治理
1. 按 `docs/github-hardening.md` 打开 branch protection。
2. 打开 secret scanning 与 push protection。
