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

## 常用命令
```bash
make sync
make install-skills
make verify
make doctor
make restart
make status
```

## 模型切换（OpenAI / 本地）
在 `.env.local` 中切换 `OPENCLAW_LLM_MODE` 后执行 `make sync`：

```bash
# 切回 OpenAI Codex
OPENCLAW_LLM_MODE=openai-codex
OPENCLAW_OPENAI_MODEL=openai-codex/gpt-5.3-codex

# 切到本地 OpenAI-compatible 服务
OPENCLAW_LLM_MODE=local
OPENCLAW_LOCAL_PROVIDER=local
OPENCLAW_LOCAL_MODEL_ID=my-local-model
OPENCLAW_LOCAL_BASE_URL=http://127.0.0.1:1234/v1
OPENCLAW_LOCAL_API=openai-completions
OPENCLAW_LOCAL_API_KEY=local-noauth

# 可选：SGLang 工具调用适配（把 <tool_call> 转换为标准 tool_calls）
OPENCLAW_LOCAL_TOOLCALL_ADAPTER=sglang
OPENCLAW_LOCAL_TOOLCALL_ADAPTER_BASE_URL=http://127.0.0.1:31001/v1
# 可选：是否启用预压缩 memory flush（适配模式默认会自动关闭）
OPENCLAW_MEMORY_FLUSH_ENABLED=false
```

```bash
make sync
openclaw models status --plain
```

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
