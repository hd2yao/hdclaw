#!/bin/sh
set -eu

PORT="${BACKEND_PORT:-${PORT:-3000}}"
URL="http://127.0.0.1:${PORT}/health"

wget -qO- "$URL" >/dev/null 2>&1 || exit 1
