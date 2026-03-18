# OpenClaw VM 宿主机直装 + 本地 Qwen 直连 Runbook

> 适用场景：虚拟机作为长期运行节点，直接在 VM 宿主机安装 `openclaw`，默认模型走本地 Qwen，不在 VM 内再套 Docker 跑 OpenClaw。

## 目标

这份 runbook 解决的是下面这类部署需求：

- 虚拟机本身就是长期维护节点
- 需要直接在 VM 上看日志、改配置、查进程
- 不希望所有运维动作都绕一层 `docker exec`
- 模型走现有本地 OpenAI-compatible Qwen 服务
- 不启用 `sglang` adapter

当前已对齐的现网参考来自正在运行的 Docker 实例：

- 本地模型上游地址：`http://192.168.6.230:30000/v1`
- 本地模型 provider API：`openai-completions`
- 本地模型 ID：`/data/qwen3.5-27b`
- `OPENCLAW_LOCAL_TOOLCALL_ADAPTER=off`

但这次在 VM 上直接探测上游接口时，`/v1/models` 返回的实际模型 id 是：

- `qwen3.5-27b`

因此，VM 宿主机直装时优先以 **上游接口真实返回值** 为准，不直接照抄 Docker 容器里的 `/data/qwen3.5-27b`。

## 为什么选宿主机直装

相比“VM 里再跑 Docker，再在 Docker 里跑 OpenClaw”，宿主机直装更适合这类节点：

- 运行时状态集中在 VM 宿主机
- `~/.openclaw`、日志、workspace 路径更直观
- 排障时不用先判断问题在宿主机还是容器
- 更容易接 systemd、备份、监控和定时任务

代价是这条路径不是当前仓库默认的 Docker-first 主路径，所以需要单独维护这份 runbook。

## 前置条件

推荐环境：

- Ubuntu 22.04 或 Debian 12
- 当前登录用户具备 `sudo`
- VM 能访问 `http://192.168.6.230:30000/v1`
- 已安装或可安装 `git`、`jq`、`ruby`

先安装基础依赖：

```bash
sudo apt-get update
sudo apt-get install -y git jq ruby curl make
```

## 步骤 1：安装 OpenClaw

优先尝试官方安装脚本：

```bash
curl -fsSL https://openclaw.ai/install.sh | bash
```

安装完成后执行初始化：

```bash
openclaw onboard --install-daemon
```

如果你希望 OpenClaw 以宿主机后台服务形式长期运行，这一步不要跳过。

如果官方脚本在 Ubuntu 24.04 VM 上长时间无输出，按下面这条兜底路径执行：

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
sudo bash /tmp/nodesource_setup.sh
sudo apt-get install -y nodejs
sudo git config --global --add url."https://github.com/".insteadOf ssh://git@github.com/
sudo git config --global --add url."https://github.com/".insteadOf git@github.com:
sudo git config --global url."https://gitclone.com/github.com/whiskeysockets/libsignal-node.git".insteadOf https://github.com/whiskeysockets/libsignal-node.git
sudo npm install -g openclaw@latest
```

说明：

- `openclaw.ai/install.sh` 在这台 Ubuntu 24.04 ARM VM 上最终也是走 npm 安装链路
- 这里显式先装 Node.js 22，是为了把问题拆开，避免把 Node 安装和 OpenClaw 安装混在一个黑盒步骤里
- Git rewrite 是为了解决某些依赖通过 `ssh://git@github.com/...` 拉取、但 VM 没有 GitHub SSH key 时直接失败的问题
- `libsignal-node` 这一个依赖在这台 VM 上通过 GitHub `git-upload-pack` 会挂住，单独把它改写到 `gitclone.com` 后可正常完成安装

## 步骤 2：验证基础运行

先确认 CLI 和 gateway 都正常：

```bash
openclaw --help
openclaw gateway status
openclaw health
openclaw dashboard --no-open
```

验收标准：

- `openclaw --help` 能正常输出
- `openclaw gateway status` 显示运行中
- `openclaw health` 不报基础错误
- `openclaw dashboard --no-open` 能返回一个可访问的地址

## 步骤 3：获取仓库并准备环境文件

```bash
git clone https://github.com/hd2yao/hdclaw.git ~/openclaw
cd ~/openclaw
cp .env.example .env.local
```

## 步骤 4：配置宿主机直连本地 Qwen

编辑 `.env.local`，至少配置下面这些值：

```bash
OPENAI_API_KEY=placeholder-disabled
FAL_KEY=placeholder-disabled

OPENCLAW_LLM_MODE=local
OPENCLAW_LOCAL_PROVIDER=local
OPENCLAW_LOCAL_MODEL_ID=qwen3.5-27b
OPENCLAW_LOCAL_BASE_URL=http://192.168.6.230:30000/v1
OPENCLAW_LOCAL_API=openai-completions
OPENCLAW_LOCAL_API_KEY=local-noauth

OPENCLAW_LOCAL_TOOLCALL_ADAPTER=off
OPENCLAW_MEMORY_FLUSH_ENABLED=false
OPENCLAW_WEB_SEARCH_MODE=off
```

说明：

- `OPENAI_API_KEY` 和 `FAL_KEY` 在这条 VM 直装链路里不是主模型必需，但当前仓库 `skills/catalog.yaml` 中 `clawra-selfie` 被标记为启用，`make sync` 会把这两个变量当成必填项检查；如果暂时不用这个 skill，可以先写占位值
- `OPENCLAW_LOCAL_MODEL_ID` 使用 provider 暴露出来的原始模型 ID：`qwen3.5-27b`
- 这里明确不启用 `sglang` adapter
- `OPENCLAW_WEB_SEARCH_MODE=off` 是为了先把主链路跑通，减少额外变量

## 步骤 5：同步仓库配置

```bash
make bootstrap
make sync
make install-skills
make verify
openclaw config set agents.defaults.workspace "$HOME/.openclaw/workspace"
openclaw gateway restart
```

各命令作用：

- `make bootstrap`：检查宿主机依赖，要求本机已存在 `openclaw`、`jq`、`ruby`
- `make sync`：把仓库模板渲染到宿主机 `~/.openclaw/openclaw.json`
- `make install-skills`：把 skills 部署到宿主机 `~/.openclaw/skills`
- `make verify`：检查 gateway、health 和技能可用性
- 由于当前仓库基础模板里 `agents.defaults.workspace` 还是一个本机路径，VM 上执行完 `make sync` 后要显式改回 `"$HOME/.openclaw/workspace"` 并重启 gateway

## 步骤 6：确认默认主模型切到本地 Qwen

先检查当前默认主模型：

```bash
openclaw models status --plain
```

如果输出已经是：

```text
local/qwen3.5-27b
```

就说明默认主模型已经正确切换。

如果输出的仍然是 OpenAI 模型，则手动切换：

```bash
openclaw config set agents.defaults.model.primary local/qwen3.5-27b
openclaw gateway restart
openclaw models status --plain
```

注意这里的值不是 `qwen3.5-27b`，而是：

```text
local/qwen3.5-27b
```

这是 OpenClaw 在 provider model id 前面加了 `local/` 前缀后的引用形式。

## 步骤 7：验证模型链路

确认 OpenClaw 已经在用本地 Qwen：

```bash
openclaw models status --plain
openclaw gateway status
openclaw health
```

如果你有本地 CLI 测试入口，再补一次真实消息验证：

```bash
openclaw agent --local --message "你好，回复一句测试文本" --json
```

验收标准：

- `openclaw models status --plain` 返回 `local/qwen3.5-27b`
- gateway 运行正常
- health 正常
- 模型能返回正常文本回复

## 常用运维命令

```bash
make doctor
make status
make restart
openclaw logs --follow
openclaw health
openclaw models status --plain
```

## 已知坑

### 1. 不要混淆模型 ID 和主模型引用

这两个值不同：

- provider model id：`qwen3.5-27b`
- OpenClaw 主模型引用：`local/qwen3.5-27b`

前者写进 `.env.local` 的 `OPENCLAW_LOCAL_MODEL_ID`。
后者用于 `agents.defaults.model.primary`。

Docker 容器里曾出现过 `/data/qwen3.5-27b` 这种内部模型名，但 VM 直连时要以 `curl http://192.168.6.230:30000/v1/models` 的真实返回值为准。

### 2. 不要同时维护宿主机直装和 Docker 两套 OpenClaw

一旦两套环境同时存在，就容易出现：

- 宿主机 `~/.openclaw/openclaw.json` 一套
- 容器内 `/home/node/.openclaw/openclaw.json` 一套
- 你以为改的是当前实例，实际改到了另一套环境

这台 VM 如果决定走宿主机直装，就不要再把它当成 Docker OpenClaw 节点维护。

### 3. 不要先把 `web_search`、adapter、群聊路由全开

先把最小主链路跑通：

- OpenClaw 能启动
- 本地 Qwen 能连通
- 默认主模型已切到 Qwen

然后再逐项加功能。这样排障成本最低。

### 4. 先确认 VM 能访问上游 Qwen 服务

部署前先单独探测：

```bash
curl -fsS http://192.168.6.230:30000/v1/models
```

如果这一步不通，不要先怀疑 OpenClaw，先排查：

- VM 到上游 Qwen 服务的网络
- 端口是否开放
- 上游服务是否真的是 OpenAI-compatible `/v1`

## 这次 VM 实测踩坑记录

下面这些问题都已经在 Ubuntu Server 24.04 ARM VM 上真实遇到过，建议部署时直接按已知坑处理。

### 1. 官方安装脚本看起来像“卡住”，但很多时候只是静默在装 Node 或跑 apt

现象：

- `curl -fsSL https://openclaw.ai/install.sh | bash` 执行后长时间没有明显进度
- 看上去像挂死，但实际可能还在跑系统安装步骤

处理：

- 如果 1 到 2 分钟都没有新增输出，不要盲等太久
- 直接切换到“NodeSource 安装 Node.js 22 + npm 全局安装 openclaw”的拆分路径，更容易定位问题

### 2. Ubuntu 24.04 的 apt 后处理会额外停在 `needrestart` / `Scanning processes...`

现象：

- `apt-get install` 主体完成后，还会停在 `Scanning processes...`
- 这是 Ubuntu 服务重启检查的一部分，不代表安装失败

处理：

- 这是正常现象，等它自己结束
- 不要因为这段输出看起来慢，就误判为系统卡死

### 3. `npm install -g openclaw@latest` 可能因为 GitHub SSH 依赖直接失败

现象：

- npm 日志里会出现类似：
- `ssh://git@github.com/whiskeysockets/libsignal-node.git`
- `Permission denied (publickey)`

原因：

- OpenClaw 的依赖树里有 GitHub 依赖默认走 SSH
- 这台 VM 没有配置 GitHub SSH key

处理：

```bash
sudo git config --global --add url."https://github.com/".insteadOf ssh://git@github.com/
sudo git config --global --add url."https://github.com/".insteadOf git@github.com:
```

注意：

- 这里必须用 `--add`
- 如果连续两次不带 `--add` 写同一个 key，后一次会覆盖前一次

### 4. `libsignal-node` 在这台 VM 上通过 GitHub HTTPS 也可能卡在 `git-upload-pack`

现象：

- `curl https://github.com` 能通
- `git ls-remote https://github.com/whiskeysockets/libsignal-node.git` 会卡住
- npm 安装停在 `libsignal-node` 阶段很久不动

处理：

```bash
sudo git config --global url."https://gitclone.com/github.com/whiskeysockets/libsignal-node.git".insteadOf https://github.com/whiskeysockets/libsignal-node.git
```

验证：

```bash
git ls-remote https://gitclone.com/github.com/whiskeysockets/libsignal-node.git
```

这台 VM 实测该镜像可以正常返回 refs，npm 随后会改走 `codeload.github.com` 拉 tarball 并完成安装。

### 5. 不要直接照抄 Docker 容器里的模型名

现象：

- Docker 容器当前配置里，本地模型 id 是 `/data/qwen3.5-27b`
- 但 VM 直接请求上游 `/v1/models`，返回的是 `qwen3.5-27b`

处理：

- 宿主机直装时，优先以 `/v1/models` 的真实返回值为准
- 先执行：

```bash
curl -fsS http://192.168.6.230:30000/v1/models
```

- 然后把返回里的模型 id 写入 `OPENCLAW_LOCAL_MODEL_ID`

### 6. GitHub tarball 下载可能被截断，导致仓库目录不完整

现象：

- `codeload.github.com` 返回的 tarball 看起来下载完成了
- 但解压时报 `Unexpected EOF in archive`
- 仓库目录还能部分解开，容易造成误判
- 后续表现通常是某些目录缺失，例如 `skills/custom/keyless-search`、`skills/custom/tavily-search`、`skills/custom/search-router`

处理：

- 解压后一定要检查目录是否完整
- 至少确认这些路径存在：
  - `skills/custom/ai-news-daily`
  - `skills/custom/clawra-selfie`
  - `skills/custom/keyless-search`
  - `skills/custom/tavily-search`
  - `skills/custom/search-router`
- 如果 tarball 不完整，优先重新拉完整包，不要在缺目录的状态下继续假定“仓库已同步完成”

### 7. 非交互 SSH 下直接跑 sudo 容易失败

现象：

- 远程脚本里直接执行 `sudo ...`，可能报：
- `a terminal is required`

处理：

- 优先在交互式 SSH TTY 里安装
- 如果一定要非交互执行，使用 `sudo -S` 并显式处理标准输入

### 8. `make sync` 可能被与主链路无关的 skill 占位变量卡住

现象：

- 明明本地 Qwen 链路已经配好了
- `make sync` 仍报：
- `missing required env vars: OPENAI_API_KEY, FAL_KEY`

原因：

- 当前仓库里 `clawra-selfie` 技能默认是启用状态
- 它会把 `OPENAI_API_KEY`、`FAL_KEY` 当成必填 env 校验

处理：

- 如果暂时不使用这个 skill，先在 `.env.local` 写占位值：

```bash
OPENAI_API_KEY=placeholder-disabled
FAL_KEY=placeholder-disabled
```

- 等后续真的要启用该 skill 时，再替换成真实密钥

### 9. `make sync` 后默认 workspace 可能仍指向本机路径

现象：

- `~/.openclaw/openclaw.json` 里的 `agents.defaults.workspace` 被写成了类似 `/Users/dysania/.openclaw/workspace`
- 这是本机路径，不适合 VM

处理：

```bash
openclaw config set agents.defaults.workspace "$HOME/.openclaw/workspace"
openclaw gateway restart
```

验证：

```bash
openclaw models status --plain
openclaw health
```

### 10. npm 安装阶段可能长时间静默，不要用“有没有输出”判断成败

现象：

- 依赖获取结束后，可能会进入长时间无输出阶段
- 这时不一定是挂住，也可能是在编译或整理全局安装内容

处理：

- 用更长的等待窗口观察
- 如果必须中断，优先去看 `/root/.npm/_logs/*.log` 定位，而不是反复盲重试

## 回滚

如果这条宿主机直装路径需要回滚：

1. 查看 `~/.openclaw/backup/<timestamp>/openclaw.json`
2. 恢复目标配置文件
3. 重启 gateway

```bash
cp ~/.openclaw/backup/<timestamp>/openclaw.json ~/.openclaw/openclaw.json
openclaw gateway restart
```

如果是模型切换导致的问题，也可以直接改回 `.env.local` 后重新执行：

```bash
make sync
make restart
```

## 与当前 Docker 实例的关系

当前本机已有一个运行中的 Docker OpenClaw 实例，配置特征如下：

- 端口映射：`127.0.0.1:18890 -> 18789`
- 本地模型上游：`http://192.168.6.230:30000/v1`
- `OPENCLAW_LOCAL_TOOLCALL_ADAPTER=off`
- 本地 Qwen provider 已存在，但默认主模型仍是 OpenAI

这份 VM runbook 的目标，是在宿主机直装环境里复用同一条 Qwen 上游链路，但把默认主模型显式切到：

```text
local//data/qwen3.5-27b
```

这样可以减少迁移变量，又避免把 VM 运行时继续绑在 Docker 上。
