# OpenClaw Fresh Docker 一键安装手册

本文沉淀了你这次完整实践（安装、配置、提权、挂载、排障），目标是：

- 快速拉起一个**全新** OpenClaw 容器（不污染本机 `~/.openclaw`）
- 一键完成核心高权限配置
- 让容器内 OpenClaw 可直接在 Obsidian 目录写文档
- 记录常见坑与对应修复

## 1. 前置条件

1. 已安装 Docker / Docker Compose
2. 仓库路径：`/Users/dysania/program/openclaw`
3. Obsidian 仓库目录存在（默认）：
   `/Users/dysania/program/documents/obsidian_vault`

可选环境变量（可写入 `.env.local`）：

```bash
OPENCLAW_DASHBOARD_PORT=18790
OPENCLAW_OBSIDIAN_VAULT=/Users/dysania/program/documents/obsidian_vault
OPENCLAW_TELEGRAM_ALLOW_FROM=1871908422
```

## 2. 一键安装命令

在仓库根目录执行：

```bash
make docker-fresh-bootstrap
```

如果需要跳过镜像重建（只重配）：

```bash
OPENCLAW_SKIP_BUILD=1 make docker-fresh-bootstrap
```

## 3. 一键脚本做了什么

脚本：`scripts/docker-fresh-bootstrap.sh`

它会自动执行：

1. `docker compose build/up --force-recreate`
2. 配置 OpenClaw 工具策略：
   - `tools.profile=full`
   - `commands.bash=true`
   - `tools.exec.host=gateway`
   - `tools.exec.security=full`
   - `tools.exec.ask=off`
   - `tools.elevated.enabled=true`
3. 配置 ACPX：
   - 启用插件
   - `permissionMode=approve-all`
   - `nonInteractivePermissions=fail`
   - 安装并绑定本地 `acpx` 命令
4. 配置 exec approvals（默认/主 agent）为 `full + ask off`
5. 如果检测到 `wexin-read-mcp/requirements.txt`，自动安装其 Python 依赖
6. 如果容器里已安装 Python Playwright，则自动安装 Chromium 浏览器
7. 启动 node host，并输出 `node.list` 状态
8. 验证：
   - `sudo -n whoami`
   - `python3 --version` / `pip3 --version`
   - `tools.exec` / `tools.elevated`
   - 本地 qwen 模型参数中已写入 `chat_template_kwargs.enable_thinking=false`
   - `obsidian_vault` 挂载路径可见

默认情况下，fresh docker bootstrap 会为 `models.providers.local` 的第一个模型写入：

```json
{
  "chat_template_kwargs": {
    "enable_thinking": false
  }
}
```

原因：

- 你当前上游 `http://192.168.6.230:30000/v1` 在 `enable_thinking=true` 时，经常长时间只输出 `reasoning_content`
- Telegram 通道里这会表现成“bot 收到消息，但正文为空，最终没有回复”
- 关闭 thinking 后，同一问题可以稳定直接产出正文

如需覆盖默认值，可在 `.env.local` 中显式设置：

```bash
OPENCLAW_LOCAL_MODEL_PARAMS_JSON='{"chat_template_kwargs":{"enable_thinking":false}}'
```

## 4. 容器与目录映射

`containers/openclaw-fresh/docker-compose.yml` 中已配置：

- 状态卷：`/home/node/.openclaw`
- 工作卷：`/home/node/workspace`
- Obsidian bind mount：
  `${OPENCLAW_OBSIDIAN_VAULT}:/home/node/.openclaw/workspace/obsidian_vault`

因此容器中的 OpenClaw 可直接写：

`/home/node/.openclaw/workspace/obsidian_vault/...`

主机会实时看到同名文件。

## 5. 首次人工步骤（不能自动化的部分）

1. 打开 Dashboard：`http://127.0.0.1:${OPENCLAW_DASHBOARD_PORT:-18790}/`
2. 完成 OpenAI Codex OAuth 登录
3. Telegram 配对/审批（如果使用 Telegram 通道）

## 6. 快速验收

```bash
make docker-shell
openclaw gateway health --json
openclaw config get tools.exec --json
openclaw config get tools.elevated --json
python3 --version
pip3 --version
sudo -n whoami
ls -la /home/node/.openclaw/workspace/obsidian_vault | head
```

如果还要验 Telegram 群聊，补跑：

```bash
make docker-shell
openclaw channels status --probe
openclaw doctor
```

然后在目标群里发一条：

```text
@YourBot 你好
```

## 7. 实践踩坑与修复清单

1. `origin not allowed`
   - 原因：Dashboard 打开端口与 `gateway.controlUi.allowedOrigins` 不一致
   - 修复：写入 `localhost/127.0.0.1` 的 Dashboard 端口和网关端口

2. `Approval required` 每次都弹
   - 原因：`tools.exec` 默认 `allowlist + on-miss`
   - 修复：`tools.exec.security=full` + `tools.exec.ask=off`

3. `elevated is not available`
   - 原因：`tools.elevated.allowFrom.telegram` 未命中发送者 ID
   - 修复：配置 `OPENCLAW_TELEGRAM_ALLOW_FROM`（支持逗号分隔）

4. ACPX 启动时报权限错误（EACCES）
   - 原因：插件尝试写 `/usr/local/...` 自动安装 acpx
   - 修复：安装到 `/home/node/.openclaw/acpx-runtime` 并将插件命令指向该路径

5. `web_search` 不工作（`missing_brave_api_key`）
   - 原因：未配置搜索 provider key
   - 修复：配置 `OPENCLAW_WEB_SEARCH_API_KEY` 或关闭该工具路径

6. `apt` 权限不足
   - 原因：容器默认用户是 `node`
   - 修复：镜像内置 `sudo` + `node NOPASSWD`，命令使用 `sudo -n ...`

7. 重建容器后 sudo 丢失
   - 原因：只在运行中手工安装，未写入镜像
   - 修复：已持久化到 `containers/openclaw-fresh/Dockerfile`

8. `python3: not found`（抓取脚本偶发又报缺 Python）
   - 原因：之前是运行时手工 `apt install`，容器一旦 `recreate` 就会丢
   - 修复：已把 `python3`/`python3-pip` 固化到 `containers/openclaw-fresh/Dockerfile`，重建镜像后长期生效

9. `Host system is missing dependencies to run browsers`
   - 原因：`weixin-read-mcp` 依赖 Python Playwright，但容器缺少 Chromium 的 Linux 运行库
   - 修复：已把常用 Playwright 运行库固化到 `containers/openclaw-fresh/Dockerfile`，并在 bootstrap 中自动执行 `python3 -m playwright install chromium`

10. 容器重建后 `weixin-read-mcp` 又提示缺少 `playwright` / `fastmcp` / `bs4`
   - 原因：这些 Python 包之前是运行时手工安装，没进入镜像，也不在持久卷里
   - 修复：bootstrap 现在会自动对 `/home/node/.openclaw/workspace/wexin-read-mcp/requirements.txt` 执行 `pip3 install --user --break-system-packages -r ...`

11. Telegram 群里 `@bot` 没反应，但私聊正常
   - 现象：`openclaw channels status --probe` 显示 Telegram 正常，但群里 `@bot` 无回复
   - 典型原因：
     - Docker 实例的 `channels.telegram.groupPolicy=allowlist`，但没有配置 `groupAllowFrom` / `allowFrom`
     - 误以为仓库里的 `make sync` 会同步到容器；实际上 `docker-fresh` 使用容器内独立的 `~/.openclaw/openclaw.json`
   - 推荐修复（群消息默认允许进入，再由 bot 自己判断是否响应）：

```bash
make docker-shell
openclaw config set channels.telegram.groupPolicy open
```

   - 如果你明确只想允许指定用户在群里触发，再加：

```bash
openclaw config set --strict-json channels.telegram.groupAllowFrom '["1871908422"]'
```

   - 修改后不要执行 `openclaw gateway restart`；容器里网关是前台模式。应在宿主机执行：

```bash
docker compose -f containers/openclaw-fresh/docker-compose.yml restart openclaw
```

   - 验证：

```bash
docker compose -f containers/openclaw-fresh/docker-compose.yml exec -T openclaw sh -lc 'openclaw channels status --probe'
docker compose -f containers/openclaw-fresh/docker-compose.yml exec -T openclaw sh -lc 'openclaw doctor'
```

   - 说明：`OPENCLAW_TELEGRAM_ALLOW_FROM` 只影响 `tools.elevated.allowFrom.telegram`，不等于“开启 Telegram 群聊”

## 8. 回滚与重装

1. 停止并删除容器：

```bash
make docker-down
```

2. 重装：

```bash
make docker-fresh-bootstrap
```

---

如果后续你要再开第二套容器，只要复制 `containers/openclaw-fresh` 为新目录并改 `name:`，再用 `DOCKER_STACK=新目录名 make docker-fresh-bootstrap` 即可。
