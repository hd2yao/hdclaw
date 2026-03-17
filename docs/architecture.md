# OpenClaw 单仓架构

## 目标
- 本仓库是 Docker-first OpenClaw 运行方案、官方镜像定制层与相关脚本的事实源。
- 当前推荐运行时不在宿主机直装 `openclaw`，而是在 Docker volume 中维护容器内状态。

## 分层
1. `config/`: 可入库、非敏感模板。
2. `skills/custom`: 自定义 skill 源码。
3. `skills/vendor`: 固定版本第三方 skill 镜像。
4. `scripts/`: Docker bootstrap、历史同步脚本、验证自动化。
5. `tests/`: 配置与技能冒烟测试。

## 数据流
1. `.env.local` + Docker Compose 模板 + `scripts/docker-fresh-bootstrap.sh`
2. `make docker-build` 构建基于官方镜像的运行时
3. `make docker-up` 创建容器与独立卷：`openclaw-home`、`openclaw-workspace`
4. `make docker-official-bootstrap` 将运行配置写入容器内 `/home/node/.openclaw/openclaw.json`，并在宿主机保存固定 token 文件到 `~/.openclaw-docker/`
5. `scripts/sync-config.sh` / `scripts/install-skills.sh` 保留给历史宿主机直装场景，不再是默认主路径

## 安全边界
- 密钥只允许存在于 `.env.local`、宿主机 `~/.openclaw-docker/*` token 文件，以及容器内 `/home/node/.openclaw/openclaw.json`。
- 仓库禁止存储 token/api key 明文。
