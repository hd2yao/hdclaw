# Windows 本机安装 OpenClaw

这份文档只讲一件事：在原生 Windows 上安装 OpenClaw，不使用 `WSL2`，不需要 `Ubuntu`。

先说边界：

- 这条路径是 `PowerShell + native Windows`
- OpenClaw 官方当前仍然更推荐 `WSL2`
- 但如果你的目标就是“直接装在 Windows 本机”，下面这套流程是可执行的

官方依据：

- [OpenClaw Windows 文档](https://docs.openclaw.ai/windows)
- [OpenClaw 安装文档](https://docs.openclaw.ai/zh-CN/install/index)
- [OpenClaw 新手引导](https://docs.openclaw.ai/zh-CN/start/wizard)

## 前置条件

建议环境：

- Windows 10/11
- PowerShell
- 能访问外网下载 OpenClaw 安装脚本

说明：

- 官方安装器会处理 OpenClaw CLI 安装
- 如果本机没有满足要求的 Node.js，安装器会提示并处理对应依赖
- 如果后续你要用 `git` 方式安装或管理源码，再额外安装 Git

## 最短安装路径

用 PowerShell 执行下面这几步即可。

### 1. 打开 PowerShell

建议用“以管理员身份运行”的 PowerShell。
不是绝对必须，但后面如果要安装/修复 Gateway 服务，会更省事。

### 2. 执行官方安装脚本

```powershell
iwr -useb https://openclaw.ai/install.ps1 | iex
```

这条命令会在 Windows 本机安装 OpenClaw。

如果你只想先安装 CLI，不马上进入引导流程：

```powershell
& ([scriptblock]::Create((iwr -useb https://openclaw.ai/install.ps1))) -NoOnboard
```

如果你想看安装器支持哪些参数：

```powershell
& ([scriptblock]::Create((iwr -useb https://openclaw.ai/install.ps1))) -?
```

### 3. 执行初始化

如果安装器没有自动带你进入 onboarding，就手动执行：

```powershell
openclaw onboard --install-daemon
```

这一步通常会完成：

- 初始化 `~/.openclaw` 对应的 Windows 用户目录配置
- 安装或修复 Gateway 后台服务
- 生成默认 workspace / channel / agent 配置

如果只是想重新走一遍配置向导：

```powershell
openclaw configure
```

### 4. 验证安装结果

先确认命令可用：

```powershell
openclaw --help
```

再检查 Gateway：

```powershell
openclaw gateway status
```

健康检查：

```powershell
openclaw health
```

打开控制台：

```powershell
openclaw dashboard
```

如果这几步都正常，说明原生 Windows 安装已经完成。

## 推荐安装方式细节

### 方案 A：默认安装器

这是最直接的方式：

```powershell
iwr -useb https://openclaw.ai/install.ps1 | iex
```

适合场景：

- 你只想尽快把 OpenClaw 装起来
- 不关心安装细节
- 希望后续继续跟着官方升级路径走

### 方案 B：先安装，再手动 onboarding

```powershell
& ([scriptblock]::Create((iwr -useb https://openclaw.ai/install.ps1))) -NoOnboard
openclaw onboard --install-daemon
```

适合场景：

- 你想把“安装 CLI”和“初始化服务”拆开执行
- 你需要先检查 PATH、代理或权限

### 方案 C：用 Git 方式安装

如果官方安装器参数里启用了 `git` 安装方式，可以这样执行：

```powershell
& ([scriptblock]::Create((iwr -useb https://openclaw.ai/install.ps1))) -InstallMethod git
```

如果你想指定源码目录，再加：

```powershell
& ([scriptblock]::Create((iwr -useb https://openclaw.ai/install.ps1))) -InstallMethod git -GitDir "$env:USERPROFILE\\program\\openclaw-src"
```

适合场景：

- 你明确知道自己要保留源码安装路径
- 你后面准备直接跟踪 OpenClaw 上游代码

注意：

- 这条路通常要求本机已经有 `git`
- 如果你只是普通使用者，不需要优先选这条

## 常见问题

### 1. `openclaw` 命令找不到

先在 PowerShell 里检查：

```powershell
where.exe openclaw
node --version
```

如果 `openclaw` 找不到，优先排查全局 npm 路径是否进了 `PATH`。
Windows 常见全局命令目录通常在：

```powershell
$env:APPDATA\npm
```

可以先看这个目录下有没有：

```powershell
Get-ChildItem "$env:APPDATA\npm" | Where-Object { $_.Name -like "openclaw*" }
```

如果目录里有 `openclaw.cmd`，但当前 shell 调不到，重开一个 PowerShell 再试。
还不行，就把该目录加入用户级 `PATH`。

### 2. Gateway 没起来

先执行：

```powershell
openclaw doctor
```

再看：

```powershell
openclaw gateway status
```

如果是权限问题，重新用管理员 PowerShell 执行：

```powershell
openclaw onboard --install-daemon
```

### 3. 安装器报缺少 Git

只有在你显式使用 `-InstallMethod git` 或某些源码路径流程里，才会需要 Git。
如果你不打算源码安装，就直接用默认安装器，不要强行走 `git` 模式。

### 4. 我只想在 Windows 本机跑，不想装 WSL2，可以吗

可以。
这份文档就是原生 Windows 路径。

但要知道现实限制：

- 某些自定义 skills 假设 shell 是 `bash`
- 某些脚本默认按 Linux/macOS 路径写
- 你后面如果要维护复杂 workspace，本机兼容成本通常会高于 `WSL2`

也就是说：

- “装起来并运行”可以在 native Windows 完成
- “长期维护复杂自定义技能链路”则未必是最低成本方案

### 5. 当前这个仓库能不能直接照搬到 Windows 本机

不建议直接照搬。

原因：

- 当前仓库大量命令入口是 `make`
- 脚本主要是 `bash`
- 技能安装和软链逻辑也偏 Unix 风格

如果你的目标只是先把 OpenClaw 装起来，先按这份文档完成原生 Windows 安装。
如果后面你还要把这个单仓管理方案迁到 Windows，需要单独补一层 PowerShell 兼容脚本。

## 最短可执行命令清单

只看这一段也可以完成安装：

```powershell
iwr -useb https://openclaw.ai/install.ps1 | iex
openclaw onboard --install-daemon
openclaw gateway status
openclaw health
openclaw dashboard
```

如果你要的是“就在 Windows 本机装一个可用的 OpenClaw”，这就是最短路径。
