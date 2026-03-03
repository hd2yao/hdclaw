# Runbook

## 首次初始化
```bash
make bootstrap
cp .env.example .env.local
# 编辑 .env.local，填入真实密钥
make sync
make install-skills
make verify
```

## 日常操作
```bash
make sync
make install-skills
make verify
```

## 网关控制
```bash
make start
make restart
make status
openclaw health
```

## 故障排查
```bash
make doctor
openclaw logs --follow
```

## 密钥轮换
1. 修改 `.env.local` 中对应变量。
2. 执行 `make sync`。
3. 执行 `make verify` 确认运行正常。

## 回滚配置
1. 查看 `~/.openclaw/backup/<timestamp>/openclaw.json`。
2. 复制目标备份覆盖 `~/.openclaw/openclaw.json`。
3. `openclaw gateway restart`。
