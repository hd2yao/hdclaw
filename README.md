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
## 网关地址
- Dashboard: `http://127.0.0.1:18789/`

## 注意
- `.env.local` 不入库。
- 密钥只放 `.env.local` 和本机 `~/.openclaw/openclaw.json`。
- GitHub 治理开关见 `docs/github-hardening.md`。
