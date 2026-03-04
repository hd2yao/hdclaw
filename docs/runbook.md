# Runbook

## 首次初始化
```bash
make bootstrap
cp .env.example .env.local
# 编辑 .env.local，填入真实密钥
make sync
make install-skills
make verify
```

## 日常操作
```bash
make sync
make install-skills
make verify
```

## 切换模型后端（OpenAI / 本地）
1. 修改 `.env.local` 中以下变量：
   - `OPENCLAW_LLM_MODE=openai-codex`（OpenAI）或 `OPENCLAW_LLM_MODE=local`（本地）
   - 本地模式补充：`OPENCLAW_LOCAL_PROVIDER`、`OPENCLAW_LOCAL_MODEL_ID`、`OPENCLAW_LOCAL_BASE_URL`、`OPENCLAW_LOCAL_API`、`OPENCLAW_LOCAL_API_KEY`
   - SGLang 文本工具调用适配（可选）：`OPENCLAW_LOCAL_TOOLCALL_ADAPTER=sglang`、`OPENCLAW_LOCAL_TOOLCALL_ADAPTER_BASE_URL`
2. 执行 `make sync`。
3. 执行 `openclaw models status --plain` 确认当前主模型。

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
3. 执行 `make sync && make restart`。
4. 用 `openclaw agent --local --to +15550001111 --message "给我最新十条美国金融资讯" --json` 验证返回内容不再是原始 `<tool_call>` 文本。
5. 运行 adapter 验证脚本：`make test-adapter`。
6. 需要压测时运行：`bash tests/adapter/latency-benchmark.sh`。

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
make start
make restart
make status
openclaw health
```

## 故障排查
```bash
make doctor
openclaw logs --follow
```

## 密钥轮换
1. 修改 `.env.local` 中对应变量。
2. 执行 `make sync`。
3. 执行 `make verify` 确认运行正常。
4. Gateway token 轮换后执行 `openclaw gateway restart`。

## 回滚配置
1. 查看 `~/.openclaw/backup/<timestamp>/openclaw.json`。
2. 复制目标备份覆盖 `~/.openclaw/openclaw.json`。
3. `openclaw gateway restart`。

## GitHub 治理
1. 按 `docs/github-hardening.md` 打开 branch protection。
2. 打开 secret scanning 与 push protection。
