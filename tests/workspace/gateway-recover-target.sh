#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MAKEFILE_PATH="$ROOT_DIR/Makefile"
RUNBOOK_PATH="$ROOT_DIR/docs/runbook.md"

echo "[test-gateway-recover] checking Makefile target"

python3 - "$MAKEFILE_PATH" <<'PY'
import re
import sys
from pathlib import Path

makefile = Path(sys.argv[1]).read_text()
match = re.search(r"^docker-gateway-recover:\n((?:\t.*\n)+)", makefile, re.M)
if not match:
    raise SystemExit("missing docker-gateway-recover target")
recipe = match.group(1)
if "scripts/openclaw-watchdog.sh restart-gateway" not in recipe:
    raise SystemExit("docker-gateway-recover must call watchdog restart-gateway")
if "docker restart" in recipe:
    raise SystemExit("docker-gateway-recover must not restart the container directly")
PY

echo "[test-gateway-recover] checking runbook entry"

grep -q 'make docker-gateway-recover' "$RUNBOOK_PATH" || {
  echo "[test-gateway-recover] expected runbook to mention make docker-gateway-recover" >&2
  exit 1
}

echo "[test-gateway-recover] passed"
