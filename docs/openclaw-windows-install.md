# Windows 上安装 OpenClaw

这份文档给的是一条能落地、后续也好维护的安装路径。

结论先说：

- 官方当前强烈推荐 `Windows + WSL2`，不要把原生 Windows 当默认方案
- 如果你后面要维护 skills、Node 工具链、Gateway 服务，`WSL2` 的兼容性明显更稳
- 原生 `PowerShell` 安装可以做，但官方也明确说过 native Windows 更容易出问题

官方依据：

- OpenClaw Windows 文档：<https://docs.openclaw.ai/windows>
- OpenClaw 安装文档：<https://docs.openclaw.ai/zh-CN/install/index>
- OpenClaw 新手引导：<https://docs.openclaw.ai/zh-CN/start/wizard>
- Microsoft WSL 安装文档：<https://learn.microsoft.com/en-us/windows/wsl/install>

## 推荐方案：WSL2 安装

### 1. 在 Windows 里安装 WSL2

用管理员权限打开 PowerShell，执行：

```powershell
wsl --install -d Ubuntu
```

说明：

- 这条命令会安装 `WSL` 和默认的 `Ubuntu`
- 如果你的机器已经装过 WSL，但没有装发行版，可以先看有哪些可选发行版：

```powershell
wsl --list --online
```

然后安装指定发行版：

```powershell
wsl --install -d Ubuntu
```

如果安装过程卡在 `0.0%`，Microsoft 当前给出的兜底命令是：

```powershell
wsl --install --web-download -d Ubuntu
```

安装完成后，重启 Windows。

### 2. 首次进入 Ubuntu

重启后打开 `Ubuntu`，按提示创建 Linux 用户名和密码。

建议先更新系统包：

```bash
sudo apt update && sudo apt upgrade -y
```

### 3. 在 WSL2 里安装 OpenClaw

在 Ubuntu 终端里执行：

```bash
curl -fsSL https://openclaw.ai/install.sh | bash
```

说明：

- 官方安装器会检查并处理 `Node 22+`
- 默认会全局安装 `openclaw`，然后进入 onboarding 流程

如果你只想先安装，不想立刻进入 onboarding：

```bash
curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard
```

如需查看安装器参数：

```bash
curl -fsSL https://openclaw.ai/install.sh | bash -s -- --help
```

### 4. 运行 OpenClaw 初始化

如果你刚才用了默认安装流程，通常已经会进入引导。

如果没有，就手动执行：

```bash
openclaw onboard --install-daemon
```

这个流程会完成几件事：

- 初始化 OpenClaw 配置
- 安装或修复 Gateway 服务
- 配置基础 workspace / channel / skills 默认项

如果你后面想重新配置：

```bash
openclaw configure
```

### 5. 验证是否安装成功

先看 CLI 是否可用：

```bash
openclaw --help
```

再看 Gateway 状态：

```bash
openclaw gateway status
```

健康检查：

```bash
openclaw health
```

打开控制台 UI：

```bash
openclaw dashboard
```

如果一切正常，浏览器里应该能打开控制台。

## 可选：把这个单仓管理仓也放进 WSL2

如果你不仅是“安装 OpenClaw”，还要像当前这个仓库一样统一管理配置、skills 和脚本，建议把仓库也放到 WSL 的 Linux 文件系统里，不要放在 `C:\` 挂载盘下长期开发。

建议路径：

```bash
mkdir -p ~/program
cd ~/program
git clone <your-repo-url> openclaw
cd openclaw
```

然后按本仓库流程继续：

```bash
make bootstrap
cp .env.example .env.local
make sync
make install-skills
make verify
```

原因很直接：

- Linux 文件权限和软链行为更稳定
- skills 里如果依赖 shell / node / python，本地路径兼容性更好
- 后续维护 `~/.openclaw` 也更接近官方支持路径

## 兜底方案：原生 Windows PowerShell 安装

这条路不是推荐默认值，只适合你明确知道自己要在 native Windows 里跑。

官方 PowerShell 安装命令：

```powershell
iwr -useb https://openclaw.ai/install.ps1 | iex
```

如果跳过 onboarding，安装完成后再手动执行：

```powershell
openclaw onboard --install-daemon
```

你还可以查看安装器帮助：

```powershell
& ([scriptblock]::Create((iwr -useb https://openclaw.ai/install.ps1))) -?
```

注意：

- 官方当前仍然推荐 `WSL2`
- native Windows 在 Node、shell、skills、守护进程和路径兼容性上风险更高
- 如果你要跑自定义 skills，这条路后面很容易继续补兼容

## 常见问题

### 1. `openclaw` 命令找不到

先检查 Node / npm 的全局路径是否进了 `PATH`。

在 WSL2 里可以检查：

```bash
node --version
npm prefix -g
echo "$PATH"
```

如果是 Windows PowerShell，重点看全局 npm 目录是否在 `PATH` 里。

### 2. Gateway 没起来

优先执行：

```bash
openclaw doctor
```

然后再看：

```bash
openclaw gateway status
```

官方 Windows 文档也明确建议在 `WSL2` 内安装 Gateway 服务。

### 3. 为什么不建议把 OpenClaw 主体直接装在原生 Windows

因为官方当前的实际推荐路径就是：

- CLI + Gateway 运行在 Linux / WSL2
- 这样 Node、pnpm、shell、skills、二进制依赖都更一致

如果只是短期试用，native Windows 可以装。
如果你要长期维护 bot、skills、workspace，直接从 `WSL2` 开始更省事。

## 最短可执行路径

如果你只想最快跑起来，按这个顺序做：

1. 管理员 PowerShell 执行 `wsl --install -d Ubuntu`
2. 重启，打开 Ubuntu
3. 在 Ubuntu 里执行 `curl -fsSL https://openclaw.ai/install.sh | bash`
4. 执行 `openclaw onboard --install-daemon`
5. 执行 `openclaw gateway status`
6. 执行 `openclaw dashboard`

这条路径和官方当前推荐方向一致，后续扩展 skills 也最稳。
