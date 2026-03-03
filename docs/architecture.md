# OpenClaw 单仓架构

## 目标
- 本仓库是 OpenClaw 本机配置与 skills 的唯一事实源。
- `~/.openclaw` 是部署目标，不是源码源。

## 分层
1. `config/`: 可入库、非敏感模板。
2. `skills/custom`: 自定义 skill 源码。
3. `skills/vendor`: 固定版本第三方 skill 镜像。
4. `scripts/`: 同步、安装、验证自动化。
5. `tests/`: 配置与技能冒烟测试。

## 数据流
1. `.env.local` + `config/openclaw.base.json` + `skills/catalog.yaml`
2. `scripts/sync-config.sh` 渲染并最小合并到 `~/.openclaw/openclaw.json`
3. `scripts/install-skills.sh` 将技能部署到 `~/.openclaw/skills`
4. `scripts/verify.sh` 执行健康和可用性验证

## 安全边界
- 密钥只允许存在于 `.env.local` 与本机 `~/.openclaw/openclaw.json`。
- 仓库禁止存储 token/api key 明文。
