#!/bin/sh
set -eu

PORT="${FRONTEND_PORT:-8080}"
URL="http://127.0.0.1:${PORT}/healthz"

wget -qO- "$URL" >/dev/null 2>&1 || exit 1
