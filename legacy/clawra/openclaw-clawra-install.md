# OpenClaw + Clawra 本机安装方案（macOS）

## 摘要

- 目标：先在本机安装并跑通 OpenClaw，再安装 `clawra` 自拍技能。
- 当前环境基线（已探测）：`macOS 26.2`、`Node v23.11.0`、`openclaw` 未安装、`/Users/dysania/.openclaw` 不存在。
- 结论：可直接执行官方安装路径，无需先升级 Node。

## 公开接口/配置变更

- OpenClaw 安装后会创建并维护：`/Users/dysania/.openclaw`。
- Clawra 安装后会新增/修改：
  - `/Users/dysania/.openclaw/skills/clawra-selfie`
  - `/Users/dysania/.openclaw/openclaw.json`
  - `/Users/dysania/.openclaw/workspace/IDENTITY.md`（会覆盖）
  - `/Users/dysania/.openclaw/workspace/SOUL.md`（会注入/更新段落）
- CLI 发送消息接口按当前 OpenClaw 规范使用：`--channel <平台> + --target <目标>`。

## 实施步骤（按顺序执行）

### 1. 预检查（确认环境）

#### 1.1 安装必要依赖

```bash
# 使用 Homebrew 安装必要工具（如果没有 Homebrew，先安装：https://brew.sh）
brew install jq git

# 确保 xcode-select 已安装（大部分 Mac 已预装）
xcode-select --install 2>/dev/null || true

# 验证依赖版本
node -v  # 应为 v22.12.0 或更高
npm -v   # 应为 v10.0.0 或更高
jq --version
git --version
```

- **Node.js v22.12.0+**：官方要求（当前环境 v23.11.0，满足要求）
- **jq**：用于解析 JSON 配置文件
- **git**：用于克隆技能仓库
- **xcode-select**：提供编译工具链（某些 Node 原生模块需要）

### 2. 安装 OpenClaw

```bash
curl -fsSL https://openclaw.ai/install.sh | bash
```

- 目的：安装 CLI 并进入官方安装流程。
- 若安装后 `openclaw` 命令找不到，执行：

```bash
export PATH="$(npm prefix -g)/bin:$PATH"
hash -r
openclaw --help
```

### 3. 初始化并安装守护进程

```bash
openclaw onboard --install-daemon
```

- 目的：完成本机 Gateway、认证、基础配置。

### 4. 验证 OpenClaw 可用

```bash
openclaw gateway status
openclaw doctor
openclaw status --all
openclaw dashboard
```

- 验收：Gateway running，Dashboard 可打开（浏览器本地控制台可聊天）。

### 5. 安装 Clawra 前先备份（避免身份文件被覆盖）

```bash
ts=$(date +%F-%H%M%S)
mkdir -p /Users/dysania/.openclaw/backup/$ts
cp -a /Users/dysania/.openclaw/openclaw.json /Users/dysania/.openclaw/backup/$ts 2>/dev/null || true
cp -a /Users/dysania/.openclaw/workspace/IDENTITY.md /Users/dysania/.openclaw/backup/$ts 2>/dev/null || true
cp -a /Users/dysania/.openclaw/workspace/SOUL.md /Users/dysania/.openclaw/backup/$ts 2>/dev/null || true
```

### 6. 安装 Clawra

#### 6.1 获取 FAL_KEY

1. 访问 [fal.ai](https://fal.ai) 并注册账号
2. 在 Dashboard 中创建新的 API Key
3. 确保 Key 有权限访问 Clawra 所需的模型（检查 [fal.ai](https://fal.ai) 控制台中的模型可用性）。
4. 复制 fal.ai 控制台生成的完整 FAL_KEY（原样粘贴，不要截断或手动改格式）

#### 6.2 安装 Clawra

```bash
npx clawra@latest
```

- 目的：自动安装 skill 并写入 OpenClaw 配置。
- 安装过程中会提示输入 `FAL_KEY`，粘贴你刚才创建的 key。
- **FAL_KEY 只存储在本机**（`openclaw.json` 的 `skills.entries.clawra-selfie.env.FAL_KEY`），不会写入仓库。

### 7. 验证 Clawra 安装结果

```bash
ls -la /Users/dysania/.openclaw/skills/clawra-selfie
jq '.skills.entries["clawra-selfie"]' /Users/dysania/.openclaw/openclaw.json
```

- 验收：技能目录存在，配置项存在且启用。

### 8. 联调验证（最小闭环）

```bash
openclaw dashboard
```

- 在控制台中测试：
  - `Send me a selfie`
  - `Send a pic wearing a cowboy hat`
- 如果你已配置消息渠道，再做一次真实出站测试：

```bash
openclaw message send --channel telegram --target "@your_target" --message "OpenClaw + Clawra ready"
```

## 失败场景与处理

### 1. 安装问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| `openclaw: command not found` | PATH 未设置 | 执行 `export PATH="$(npm prefix -g)/bin:$PATH"` 并重开终端 |
| `npx clawra` 卡住或超时 | 网络问题 | 检查网络，或尝试 `npm install -g clawra` 后手动运行 |
| 安装中途失败，提示权限错误 | 需要 sudo 或目录权限不足 | 检查 `~/.npm` 权限，或使用 `sudo`（不推荐） |
| `jq: command not found` | jq 未安装 | `brew install jq` |

### 2. 运行时问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| `FAL_KEY` 无效或余额不足 | API Key 错误或积分耗尽 | 去 [fal.ai](https://fal.ai) 检查 Key 余额 |
| 图片生成失败，但无错误信息 | 模型配置问题 | 检查 `openclaw.json` 的 `skills.entries.clawra-selfie.env` 配置 |
| Gateway 连接失败 | 端口被占用或服务未启动 | `openclaw gateway stop && openclaw gateway start` |
| 控制台无响应 | 守护进程未运行 | `openclaw daemon status` |

### 3. 日志查看

```bash
# 查看 OpenClaw 日志
openclaw logs
```

### 4. 手动回滚步骤

如果安装后出现问题，可以手动回滚：

```bash
# 停止服务
openclaw gateway stop

# 恢复配置备份
ts="<备份时间戳>"  # 例如 2025-01-15-143022
cp -a /Users/dysania/.openclaw/backup/$ts/* /Users/dysania/.openclaw/

# 重启服务
openclaw gateway start
```

### 5. 彻底重装（最后手段）

```bash
# 停止并删除所有 OpenClaw 数据
openclaw gateway stop
rm -rf ~/.openclaw

# 重新安装
curl -fsSL https://openclaw.ai/install.sh | bash
openclaw onboard --install-daemon
```

## 测试用例与验收标准

### 安装阶段验收

| 步骤 | 验收项目 | 成功标准 |
|------|----------|----------|
| 1. 预检查 | Node.js 版本 | `node -v` 显示 v22.12.0+ |
| 1. 预检查 | jq 安装 | `jq --version` 正常输出 |
| 2. 安装 OpenClaw | CLI 可用 | `openclaw --help` 正常执行 |
| 3. 初始化 | Gateway 服务 | `openclaw gateway status` 显示 "running" |
| 4. 验证 Dashboard | 浏览器可访问 | `openclaw dashboard --no-open` 显示的 URL 可打开 |
| 5. 备份 | 备份目录创建 | `~/.openclaw/backup/<timestamp>/` 存在 |
| 6. 安装 Clawra | 技能目录 | `~/.openclaw/skills/clawra-selfie/` 存在 |
| 7. 验证配置 | JSON 配置项 | `jq '.skills.entries["clawra-selfie"]'` 返回对象 |

### 功能阶段验收

| 测试项 | 操作 | 成功标准 |
|--------|------|----------|
| CLI 帮助 | `openclaw --help` | 显示帮助信息，无报错 |
| Gateway 状态 | `openclaw gateway status` | 显示 "running" 或 "active" |
| 健康检查 | `openclaw doctor` | 所有检查项通过 |
| 控制台聊天 | 浏览器打开 Dashboard，发送 "hello" |收到 AI 回复 |
| 技能启用 | `openclaw skills list` | 显示 "clawra-selfie" 为 "enabled" |

### 端到端功能测试（可选）

在 Dashboard 控制台中依次测试：
- `Send me a selfie`
- `Send a pic wearing a cowboy hat`

```bash
# 预期输出：
# - 图片出现在聊天界面
# - 或显示明确的错误信息（如余额不足、API 失败）
```

### 失败判定

以下任一情况即表示安装失败：

- `openclaw --help` 无法执行
- `openclaw gateway status` 显示 "stopped" 或 "error"
- `openclaw dashboard --no-open` 无法打开（返回错误或无效 URL）
- `jq '.skills.entries["clawra-selfie"]'` 返回 `null`

## 假设与默认值

- 默认目标是本机单实例（非 VPS/集群）。
- 默认使用官方安装脚本（不是源码编译）。
- 默认你接受 Clawra 对 `IDENTITY.md` 和 `SOUL.md` 的改动；若不接受，按备份回滚并改为手动安装。

## 参考文档

- [OpenClaw Install](https://docs.openclaw.ai/install/index)
- [OpenClaw Getting Started](https://docs.openclaw.ai/quickstart)
- [OpenClaw Onboarding Wizard](https://docs.openclaw.ai/wizard)
- [Clawra GitHub](https://github.com/SumeLabs/clawra)
- [Clawra NPM](https://www.npmjs.com/package/clawra)
