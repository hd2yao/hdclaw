#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

check_port() {
  local port="$1"

  if curl -fsS --max-time 2 "http://127.0.0.1:${port}" >/dev/null 2>&1; then
    return 0
  fi

  echo "port ${port} is not serving HTTP on 127.0.0.1" >&2
  return 1
}

echo "[dashboard-smoke] checking frontend dependencies"
(
  cd "${ROOT_DIR}/frontend"
  npm ls vite @vitejs/plugin-react --depth=0 >/dev/null
)

echo "[dashboard-smoke] checking backend port"
check_port 3000

echo "[dashboard-smoke] checking frontend port"
check_port 5173

echo "[dashboard-smoke] passed"
