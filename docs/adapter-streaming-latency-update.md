# Adapter Streaming And Latency Stabilization - 更新记录

## 更新时间
- 2026-03-04

## 功能更新
1. `scripts/sglang-toolcall-adapter.mjs`
- 新增真流式代理：当请求 `stream=true` 时，向 upstream 透传流式请求并增量返回 SSE。
- 新增流式异常策略：首包前失败允许 fallback，首包后失败不 fallback，仅结束 SSE 并记录日志。
- 新增流式模式环境变量：
  - `SGLANG_ADAPTER_STREAM_MODE=proxy|legacy`（默认 `proxy`）
  - `SGLANG_ADAPTER_STREAM_FALLBACK=on|off`（默认 `on`）
- 新增诊断响应头：`x-openclaw-adapter-stream-mode`。

2. 测试与验证
- 新增 `tests/adapter/fixtures/mock-upstream.mjs`。
- 新增 `tests/adapter/streaming-smoke.sh`。
- 新增 `tests/adapter/streaming-contract.sh`。
- 新增 `tests/adapter/toolcall-transform-stream.sh`。
- 新增 `tests/adapter/fallback-behavior.sh`。
- 新增 `tests/adapter/latency-benchmark.sh`。
- `Makefile` 新增 `test-adapter`。

3. 文档和配置示例
- 更新 `README.md`（adapter 启动、验证与压测命令）。
- 更新 `docs/runbook.md`（adapter 运行与回滚步骤）。
- 更新 `.env.example`（新增 adapter 流式开关示例）。

## 清理与归档策略（按需求）
1. 删除 soak 测试脚本：`scripts/context-pollution-soak.sh`。
2. 删除本轮过程产物目录：`adapter-streaming-latency-discovery/`。
3. 删除本轮运行产物：`.runtime/` 下的 benchmark/context-pollution 产物。
4. 保留本文件作为唯一更新记录文档。

## 验证结果
- `make test-adapter`：PASS
- `make test-config`：PASS
- `make verify`：PASS
