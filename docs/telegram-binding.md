# Telegram 绑定流程

本文档适用于当前仓库这套 OpenClaw 本机部署。

当前默认行为：

- 私聊策略：`channels.telegram.dmPolicy=pairing`
- 群聊策略：`channels.telegram.groupPolicy=allowlist`
- Telegram draft streaming：`channels.telegram.streamMode=off`

注意：

- 本仓库的 `make sync` 目前不会管理 Telegram bot token。
- Telegram token 属于运行时密钥，实际写入位置是 `~/.openclaw/openclaw.json`。
- 因此，绑定 Telegram 的标准入口是 `openclaw channels add ...`，不是手改仓库配置。

## 1. 前置检查

确认 gateway 正常运行：

```bash
openclaw gateway status
openclaw health
```

期望看到：

- `RPC probe: ok`
- `Telegram: ok` 或 `Telegram: configured`

如果 gateway 没启动，先执行：

```bash
make start
```

## 2. 在 BotFather 创建 Bot

1. 在 Telegram 打开 `@BotFather`
2. 执行 `/newbot`
3. 按提示设置：
   - Bot 显示名
   - Bot 用户名（必须以 `bot` 结尾）
4. 记录返回的 bot token

建议额外做两件事：

1. 执行 `/setprivacy`，按你的群聊策略决定是否关闭 privacy mode
2. 执行 `/setcommands`，后续如需原生命令菜单再补

## 3. 绑定 Telegram Channel

如果本机还没有绑定过 Telegram token，执行：

```bash
openclaw channels add --channel telegram --token '<TELEGRAM_BOT_TOKEN>'
openclaw gateway restart
openclaw channels status --probe
```

说明：

- `--token` 会把 token 写入本机运行配置
- 不要把 token 写进仓库文件
- `--probe` 用来确认 bot token 可用、Telegram API 可达

如果已经绑定过，只需要执行：

```bash
openclaw channels status --probe
```

## 4. 绑定私聊（pairing）

当前默认 `dmPolicy=pairing`，所以用户直接私聊 bot 后，不会立刻放行，需要审批 pairing。

操作步骤：

1. 在 Telegram 里给 bot 发一条消息，例如 `/start`
2. 本机查看待审批 pairing：

```bash
openclaw pairing list telegram --json
```

3. 审批对应 code：

```bash
openclaw pairing approve telegram <PAIRING_CODE> --notify
```

审批完成后，该 Telegram 用户的私聊会被放行。

## 5. 验证私聊是否已打通

在 Telegram 私聊 bot，发送任意测试消息，例如：

- `你好`
- `现在在线吗`
- `给我一句测试回复`

然后本机检查：

```bash
openclaw health
openclaw logs --follow
```

期望现象：

- `openclaw health` 显示 `Telegram: ok`
- 日志里能看到 inbound message 和 agent reply
- Telegram 侧能收到实际回复

## 6. 群聊接入

当前默认 `groupPolicy=allowlist`，并且现在没有配置 `groupAllowFrom` / `groups`，这意味着：

- 机器人加进群里后，默认不会正常放行群消息
- 就算 `@bot`，也可能没有回复

群聊有两种常见方案。

### 方案 A：最小放行

适合你自己控制的小群，先求能用：

```bash
openclaw config set channels.telegram.groupPolicy open
openclaw gateway restart
```

这会让群聊不再要求发送者在 allowlist 中，但是否需要被 `@bot`，仍受 group 配置和 Telegram privacy mode 影响。

### 方案 B：白名单放行

适合长期稳定使用：

```bash
openclaw config set --strict-json channels.telegram.groupAllowFrom '["<YOUR_TELEGRAM_USER_ID>"]'
openclaw gateway restart
```

如果还要限制具体群，再额外配置群 allowlist，例如：

```bash
openclaw config set --strict-json channels.telegram.groups '{"-1001234567890":{"requireMention":true}}'
openclaw gateway restart
```

说明：

- 群 ID 一般是负数超级群 ID，例如 `-1001234567890`
- `requireMention=true` 更安全，避免 bot 在群里抢话

## 7. 常用检查命令

```bash
openclaw channels status --probe
openclaw health
openclaw pairing list telegram --json
openclaw logs --follow
```

## 8. 常见问题

### 私聊发消息没回复

优先检查：

1. 是否还没审批 pairing
2. `openclaw health` 是否仍是 `Telegram: ok`
3. gateway 是否还在运行

排查命令：

```bash
openclaw pairing list telegram --json
openclaw gateway status
openclaw logs --follow
```

### `Telegram: configured` 但不是 `ok`

通常说明以下几类问题之一：

- token 无效
- 本机网络无法访问 Telegram Bot API
- gateway 未重启到最新配置

排查命令：

```bash
openclaw channels status --probe
openclaw gateway restart
```

### 群里 `@bot` 没反应

优先检查：

1. `channels.telegram.groupPolicy` 是否还是 `allowlist`
2. 是否配置了 `groupAllowFrom`
3. 是否配置了 `channels.telegram.groups`
4. BotFather 的 privacy mode 是否符合你的预期

### 改完配置没生效

Telegram channel 配置是运行时配置，改完后通常要重启 gateway：

```bash
openclaw gateway restart
```

## 9. 推荐的最小实际流程

如果你现在是要把一个新的 Telegram 账号接进来，最短路径是：

1. 用 BotFather 拿 token
2. `openclaw channels add --channel telegram --token '<TELEGRAM_BOT_TOKEN>'`
3. `openclaw gateway restart`
4. `openclaw channels status --probe`
5. 在 Telegram 私聊 bot 发 `/start`
6. `openclaw pairing list telegram --json`
7. `openclaw pairing approve telegram <PAIRING_CODE> --notify`
8. 再发一条测试消息确认回复
