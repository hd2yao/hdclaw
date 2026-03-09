#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INSTALL_SCRIPT="$ROOT_DIR/scripts/install-sglang-adapter-service.sh"
UNINSTALL_SCRIPT="$ROOT_DIR/scripts/uninstall-sglang-adapter-service.sh"
TEMPLATE_PATH="$ROOT_DIR/templates/launchd/ai.openclaw.sglang-adapter.plist.template"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "[test-launchd-service-template] expecting reusable assets"
[[ -f "$TEMPLATE_PATH" ]] || {
  echo "[test-launchd-service-template] missing template: $TEMPLATE_PATH" >&2
  exit 1
}

[[ -x "$INSTALL_SCRIPT" ]] || {
  echo "[test-launchd-service-template] missing executable install script: $INSTALL_SCRIPT" >&2
  exit 1
}

[[ -x "$UNINSTALL_SCRIPT" ]] || {
  echo "[test-launchd-service-template] missing executable uninstall script: $UNINSTALL_SCRIPT" >&2
  exit 1
}

HOME_DIR="$TMP_DIR/home"
LAUNCH_AGENTS_DIR="$HOME_DIR/Library/LaunchAgents"
mkdir -p "$LAUNCH_AGENTS_DIR"

echo "[test-launchd-service-template] case1: install renders parameterized plist"
HOME="$HOME_DIR" OPENCLAW_SKIP_LAUNCHCTL=1 \
  SGLANG_UPSTREAM_BASE_URL="http://192.168.6.230:30000/v1" \
  SGLANG_ADAPTER_HOST="127.0.0.1" \
  SGLANG_ADAPTER_PORT="31001" \
  SGLANG_ADAPTER_WORKDIR="/Users/dysania/program/openclaw" \
  bash "$INSTALL_SCRIPT" >/dev/null

PLIST_PATH="$LAUNCH_AGENTS_DIR/ai.openclaw.sglang-adapter.plist"
[[ -f "$PLIST_PATH" ]] || {
  echo "[test-launchd-service-template] expected rendered plist at $PLIST_PATH" >&2
  exit 1
}

plutil -lint "$PLIST_PATH" >/dev/null
grep -q "/Users/dysania/program/openclaw/scripts/sglang-toolcall-adapter.mjs" "$PLIST_PATH" || {
  echo "[test-launchd-service-template] expected adapter script path in plist" >&2
  exit 1
}
grep -q "<string>http://192.168.6.230:30000/v1</string>" "$PLIST_PATH" || {
  echo "[test-launchd-service-template] expected upstream URL in plist" >&2
  exit 1
}
grep -q "<string>31001</string>" "$PLIST_PATH" || {
  echo "[test-launchd-service-template] expected adapter port in plist" >&2
  exit 1
}

echo "[test-launchd-service-template] case2: uninstall removes rendered plist"
HOME="$HOME_DIR" OPENCLAW_SKIP_LAUNCHCTL=1 bash "$UNINSTALL_SCRIPT" >/dev/null

[[ ! -f "$PLIST_PATH" ]] || {
  echo "[test-launchd-service-template] expected uninstall to remove $PLIST_PATH" >&2
  exit 1
}

echo "[test-launchd-service-template] passed"
