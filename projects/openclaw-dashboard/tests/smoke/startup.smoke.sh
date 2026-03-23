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

API_TOKEN="${DASHBOARD_API_TOKEN:-dev-key-for-testing}"

echo "[dashboard-smoke] checking frontend dependencies"
(
  cd "${ROOT_DIR}/frontend"
  npm ls vite @vitejs/plugin-react --depth=0 >/dev/null
)

echo "[dashboard-smoke] checking backend port"
check_url "http://127.0.0.1:3000/api/health"

echo "[dashboard-smoke] checking readonly overview contract"
overview_payload="$(curl -fsS --max-time 3 -H "Authorization: Bearer ${API_TOKEN}" "http://127.0.0.1:3000/api/overview")"
if ! grep -q '"summary"' <<<"${overview_payload}" || ! grep -q '"nodes"' <<<"${overview_payload}"; then
  echo "overview endpoint is not serving the expected monitoring contract" >&2
  exit 1
fi

echo "[dashboard-smoke] checking frontend port"
check_url "http://127.0.0.1:5173/"

echo "[dashboard-smoke] checking frontend entrypoint"
if ! curl -fsS --max-time 2 "http://127.0.0.1:5173/" | grep -q '<div id="root"></div>'; then
  echo "frontend entrypoint is still serving the placeholder shell" >&2
  exit 1
fi

echo "[dashboard-smoke] checking websocket first frame"
(
  cd "${ROOT_DIR}"
  node --input-type=module <<'NODE'
import WebSocket from 'ws';

const ws = new WebSocket('ws://127.0.0.1:3000/ws');
const timeout = setTimeout(() => {
  console.error('websocket smoke check timed out');
  ws.terminate();
  process.exit(1);
}, 3000);

ws.on('message', (raw) => {
  const frame = JSON.parse(String(raw));
  if (frame.type !== 'dashboard.snapshot') {
    console.error(`unexpected first frame: ${frame.type}`);
    ws.terminate();
    clearTimeout(timeout);
    process.exit(1);
  }
  clearTimeout(timeout);
  ws.close();
  process.exit(0);
});
NODE
)

echo "[dashboard-smoke] passed"
