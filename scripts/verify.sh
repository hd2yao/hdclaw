#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CATALOG_PATH="${CATALOG_PATH:-$ROOT_DIR/skills/catalog.yaml}"

openclaw gateway status
openclaw health
openclaw skills list

rc=0
while IFS= read -r name; do
  if ! openclaw skills info "$name"; then
    echo "[verify] skill check failed: $name" >&2
    rc=1
  fi
done < <(ruby -ryaml -e '
  c = YAML.load_file(ARGV[0]) || {}
  (c["skills"] || []).each do |s|
    puts s["name"] if s["enabled"]
  end
' "$CATALOG_PATH")

if [[ "$rc" -ne 0 ]]; then
  exit "$rc"
fi

echo "[verify] done"
