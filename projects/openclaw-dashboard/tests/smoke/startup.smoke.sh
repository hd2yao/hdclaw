#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

check_url() {
  local url="$1"

  if curl -fsS --max-time 2 "${url}" >/dev/null 2>&1; then
    return 0
  fi

  echo "url ${url} is not serving the expected response" >&2
  return 1
}

echo "[dashboard-smoke] checking frontend dependencies"
(
  cd "${ROOT_DIR}/frontend"
  npm ls vite @vitejs/plugin-react --depth=0 >/dev/null
)

echo "[dashboard-smoke] checking backend port"
check_url "http://127.0.0.1:3000/api/health"

echo "[dashboard-smoke] checking frontend port"
check_url "http://127.0.0.1:5173/"

echo "[dashboard-smoke] checking frontend entrypoint"
if ! curl -fsS --max-time 2 "http://127.0.0.1:5173/" | grep -q '<div id="root"></div>'; then
  echo "frontend entrypoint is still serving the placeholder shell" >&2
  exit 1
fi

echo "[dashboard-smoke] passed"
