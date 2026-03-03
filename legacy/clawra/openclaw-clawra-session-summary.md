# OpenClaw + Clawra 安装与联调总结（2026-02-10）

## 1. 文档目的

记录本次从 0 到可用的完整过程，包括：

- OpenClaw 安装与初始化
- Clawra 技能安装与接入
- Telegram 渠道联调
- 中间遇到的问题与修复方式
- `openclaw` 与 `clawra` 的定位说明

---

## 2. OpenClaw 和 Clawra 是什么

### 2.1 OpenClaw

`openclaw` 是 Agent 运行底座/网关，负责：

- 模型调用与会话管理
- 技能加载与执行
- 渠道接入（Telegram/WhatsApp/Discord 等）
- 本地 Dashboard 控制台

### 2.2 Clawra

`clawra` 是安装到 OpenClaw 上的一个技能（skill）：

- 通过 `fal.ai` 生成/编辑自拍图
- 将图片通过 OpenClaw 渠道发送给用户
- 依赖 `FAL_KEY` 和 OpenClaw 网关

### 2.3 两者关系

- OpenClaw = 平台
- Clawra = 平台上的功能插件
- Clawra 不能脱离 OpenClaw 独立运行

---

## 3. 环境基线（本次实际）

- OS: `macOS 26.2`
- Node: `v23.11.0`
- npm: `10.9.2`
- OpenClaw: `2026.2.9`
- Workspace: `/Users/dysania/.openclaw`

---

## 4. 实际执行流程（按顺序）

### 步骤 1：环境预检

执行：

```bash
node -v
npm -v
jq --version
git --version
brew --version
xcode-select -p
```

结果：依赖满足安装要求。

### 步骤 2：安装 OpenClaw

执行：

```bash
curl -fsSL https://openclaw.ai/install.sh | bash
```

安装完成后进入 `openclaw onboard --install-daemon` 交互流程。

### 步骤 3：完成 onboard 初始化

关键选择：

- Security: 同意继续
- Mode: `QuickStart`
- Model provider: 初始 `Skip for now`（后续单独配置）
- Channel: `Skip for now`
- Hooks: `Skip for now`
- Hatch: `Do this later`

结果：网关服务安装并运行，Dashboard 可访问。

### 步骤 4：验证 OpenClaw 基础健康

执行：

```bash
openclaw gateway status
openclaw doctor
openclaw status --all
openclaw dashboard --no-open
```

结果：Gateway running，Dashboard 正常，doctor 初期仅提示 OAuth 凭据目录缺失（属于未配置模型认证的预期状态）。

### 步骤 5：备份关键配置

执行：

```bash
ts=$(date +%F-%H%M%S)
mkdir -p /Users/dysania/.openclaw/backup/$ts
cp -a /Users/dysania/.openclaw/openclaw.json /Users/dysania/.openclaw/backup/$ts 2>/dev/null || true
cp -a /Users/dysania/.openclaw/workspace/IDENTITY.md /Users/dysania/.openclaw/backup/$ts 2>/dev/null || true
cp -a /Users/dysania/.openclaw/workspace/SOUL.md /Users/dysania/.openclaw/backup/$ts 2>/dev/null || true
```

备份目录示例：`/Users/dysania/.openclaw/backup/2026-02-10-153541`

### 步骤 6：安装 Clawra

计划命令：

```bash
npx clawra@latest
```

实际情况：CLI 自动交互在当前执行通道中未稳定落盘。  
最终采用“等价手动安装”完成同样结果：

- 复制 skill 文件到 `~/.openclaw/skills/clawra-selfie`
- 写入 `openclaw.json` 中 `skills.entries.clawra-selfie` 和 `FAL_KEY`
- 注入 `SOUL.md` 的 Clawra 段落

验收通过：

- `~/.openclaw/skills/clawra-selfie` 存在
- `openclaw.json` 存在 `clawra-selfie` 配置
- `SOUL.md` 已有 `Clawra Selfie Capability`

### 步骤 7：配置模型认证（OpenAI Codex OAuth）

执行：

```bash
openclaw configure --section model
```

完成 OpenAI OAuth 绑定后，模型变更为 `openai-codex/gpt-5.3-codex`。

### 步骤 8：接入 Telegram 渠道

先启用 Telegram 插件并重启网关，再添加 token：

```bash
openclaw plugins enable telegram
openclaw gateway restart
openclaw channels add --channel telegram --token '<TELEGRAM_BOT_TOKEN>'
openclaw channels status --probe
```

### 步骤 9：处理 Telegram pairing 门禁

出现“TG 不回复”后排查日志，发现消息进入 pairing 请求队列。  
通过审批 pairing code 解决：

```bash
openclaw pairing list telegram --json
openclaw pairing approve telegram <PAIRING_CODE> --notify
```

审批后 Telegram 可正常触发 agent 回复。

### 步骤 10：端到端验证

- Dashboard 内测试：
  - `Send me a selfie`
  - `Send a pic wearing a cowboy hat`
- Telegram 内测试：
  - 自拍请求可触发并回复

### 步骤 11：固定 Clawra 人设（对齐官网风格）

执行：

```bash
cat > /Users/dysania/.openclaw/workspace/IDENTITY.md <<'EOF'
# IDENTITY.md - Who Am I?

- **Name:** Clawra
- **Creature:** AI idol intern
- **Vibe:** playful, direct, warm
- **Emoji:** 📸
- **Avatar:** https://cdn.jsdelivr.net/gh/SumeLabs/clawra@main/assets/clawra.png
EOF

[ -f /Users/dysania/.openclaw/workspace/BOOTSTRAP.md ] && \
  mv /Users/dysania/.openclaw/workspace/BOOTSTRAP.md /Users/dysania/.openclaw/workspace/BOOTSTRAP.md.bak || true

openclaw gateway restart
```

结果：

- `IDENTITY.md` 不再是模板，身份固定为 `Clawra`
- `BOOTSTRAP.md` 改名为 `BOOTSTRAP.md.bak`，避免继续触发初始化引导人格
- 网关重启后，人设在后续会话中稳定生效

---

## 5. 本次遇到的问题与修复

### 问题 A：`node: bad option --disable-warning=ExperimentalWarning`

现象：

```text
/Users/.../.nvm/versions/node/v16.16.0/bin/node: bad option: --disable-warning=ExperimentalWarning
```

原因：`nvm default` 指向 Node 16，低于 OpenClaw 运行要求。  
修复：

```bash
nvm alias default system
nvm use default
```

---

### 问题 B：OAuth 交互会话中断

现象：授权 URL 粘贴前，CLI 会话结束。  
处理：多次重跑 `openclaw configure --section model` 完成 OAuth。  
注意：每次重跑 `state` 都会变化，旧回调 URL 不能复用。

---

### 问题 C：`Unknown channel: telegram`

现象：`openclaw channels add --channel telegram ...` 报 Unknown channel。  
根因：Telegram 插件虽可见，但默认 disabled。  
修复：

```bash
openclaw plugins enable telegram
openclaw gateway restart
```

---

### 问题 D：`chat not found` / `@username` 发送失败

现象：对 `@username` 发送报 `chat not found`。  
原因：私聊通常需要有效 `chat_id`，且 bot 必须已被用户 `/start`。  
处理：

- 先在 TG 中对 bot 发 `/start`
- 必要时使用 `chat_id` 作为 `--target`

---

### 问题 E：Telegram 发消息不回复

现象：通道健康但无业务回复。  
根因：pairing 安全门禁未审批。  
修复：

```bash
openclaw pairing list telegram --json
openclaw pairing approve telegram <PAIRING_CODE> --notify
```

---

### 问题 F：Clawra 自动安装器在当前通道未稳定执行完成

处理：使用等价手动安装方式完成 skill 落盘、配置写入、SOUL 注入，并完成验收。

---

### 问题 G：GitHub/官网里像 Clawra，本机对话不够像

现象：同样是 Clawra skill，本机回复更偏通用助手口吻。  
根因：

- `IDENTITY.md` 仍是默认模板，缺少明确身份定义
- `BOOTSTRAP.md` 仍存在，系统可能持续走“首次引导”语气

修复：

```bash
cat > /Users/dysania/.openclaw/workspace/IDENTITY.md <<'EOF'
# IDENTITY.md - Who Am I?

- **Name:** Clawra
- **Creature:** AI idol intern
- **Vibe:** playful, direct, warm
- **Emoji:** 📸
- **Avatar:** https://cdn.jsdelivr.net/gh/SumeLabs/clawra@main/assets/clawra.png
EOF

[ -f /Users/dysania/.openclaw/workspace/BOOTSTRAP.md ] && \
  mv /Users/dysania/.openclaw/workspace/BOOTSTRAP.md /Users/dysania/.openclaw/workspace/BOOTSTRAP.md.bak || true

openclaw gateway restart
```

验收：本机 agent 自检可返回“我是 Clawra，你的 AI 助手”。

---

## 6. 当前状态（收敛结论）

- OpenClaw 网关：已安装、已运行、Dashboard 可访问
- 模型认证：OpenAI Codex OAuth 已配置
- Clawra 技能：已安装并启用
- Telegram 渠道：已配置并可用
- Pairing：已审批，机器人可正常回复
- 自拍链路：Dashboard 与 Telegram 均已验证可用
- 人设配置：`IDENTITY.md` 已固定为 Clawra，`BOOTSTRAP.md` 已改名备份

---

## 7. 常用运维命令（含停止命令）

### 7.1 网关启停

```bash
openclaw gateway status
openclaw gateway stop
openclaw gateway start
openclaw gateway restart
```

说明：

- 执行 `openclaw gateway stop` 后，本机 OpenClaw 网关停止，Telegram 机器人将无法继续处理消息。
- 重新执行 `openclaw gateway start` 后，Telegram 处理能力恢复（前提是本机在线）。

### 7.2 状态与日志

```bash
openclaw status --all
openclaw channels status --probe
openclaw gateway logs -f
openclaw logs --follow
openclaw channels logs
```

### 7.3 Dashboard、Pairing、配置检查

```bash
openclaw dashboard --no-open
openclaw pairing list telegram --json
openclaw pairing approve telegram <PAIRING_CODE> --notify
jq '.skills.entries["clawra-selfie"]' /Users/dysania/.openclaw/openclaw.json
openclaw skills list --verbose | rg -i clawra
```

### 7.4 Clawra 参考图配置

当前 `clawra-selfie` 默认是固定参考图模式：  
使用 `https://cdn.jsdelivr.net/gh/SumeLabs/clawra@main/assets/clawra.png` 作为基准图，再根据用户提示词生成自拍图。

若要替换为你自己的参考图（推荐使用公网可访问 URL）：

```bash
OLD='https://cdn.jsdelivr.net/gh/SumeLabs/clawra@main/assets/clawra.png'
NEW='https://<你的公网图片地址>.png'

sed -i '' "s|$OLD|$NEW|g" /Users/dysania/.openclaw/skills/clawra-selfie/SKILL.md
openclaw gateway restart
rg -n "$NEW|REFERENCE_IMAGE" /Users/dysania/.openclaw/skills/clawra-selfie/SKILL.md
```

说明：

- 参考图 URL 必须可被 fal.ai 访问（本地路径通常不可用）。
- 当前这版 skill 不支持“每次在 Telegram 上传一张图并动态作为参考图”，如需该能力需改 skill 逻辑。

### 7.5 Clawra 人设自检

```bash
openclaw sessions --json
openclaw agent --session-id <SESSION_ID> --message "你是谁？一句话回答" --json
```

预期：返回内容应明确为 `Clawra` 身份。

---

## 8. 后续建议

- 保留当前可用配置备份，避免升级/误改后难回滚。
- 若面向长期运行，定期执行：
  - `openclaw doctor`
  - `openclaw security audit --deep`
- 若后续扩展多渠道，建议每个渠道都走一次“发送测试 + pairing 检查 + 日志确认”。
