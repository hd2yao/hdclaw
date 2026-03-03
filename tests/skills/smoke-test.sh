#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "[test-skills] installing enabled local skills (online disabled)"
INSTALL_ONLINE=false bash "$ROOT_DIR/scripts/install-skills.sh"

echo "[test-skills] checking enabled skill info"
ruby -ryaml -e '
  c = YAML.load_file(ARGV[0]) || {}
  (c["skills"] || []).each do |s|
    puts s["name"] if s["enabled"]
  end
' "$ROOT_DIR/skills/catalog.yaml" | while IFS= read -r skill; do
  openclaw skills info "$skill" >/dev/null
  echo "[test-skills] ok: $skill"
done

echo "[test-skills] passed"
