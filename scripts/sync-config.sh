#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_CONFIG_PATH="${BASE_CONFIG_PATH:-$ROOT_DIR/config/openclaw.base.json}"
LOCAL_PATCH_PATH="${LOCAL_PATCH_PATH:-$ROOT_DIR/config/openclaw.local.patch.json}"
CATALOG_PATH="${CATALOG_PATH:-$ROOT_DIR/skills/catalog.yaml}"
ENV_FILE="${OPENCLAW_ENV_FILE:-$ROOT_DIR/.env.local}"
TARGET_CONFIG="${OPENCLAW_CONFIG_TARGET:-$HOME/.openclaw/openclaw.json}"
BACKUP_ROOT="${OPENCLAW_BACKUP_DIR:-$HOME/.openclaw/backup}"

[[ -f "$BASE_CONFIG_PATH" ]] || { echo "[sync-config] missing base config: $BASE_CONFIG_PATH" >&2; exit 1; }
[[ -f "$CATALOG_PATH" ]] || { echo "[sync-config] missing catalog: $CATALOG_PATH" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "[sync-config] missing env file: $ENV_FILE" >&2; exit 1; }

tmp_empty_json="$(mktemp)"
echo '{}' > "$tmp_empty_json"

if [[ -f "$LOCAL_PATCH_PATH" ]]; then
  PATCH_PATH="$LOCAL_PATCH_PATH"
else
  PATCH_PATH="$tmp_empty_json"
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

missing_vars="$(ruby -ryaml -e '
  c = YAML.load_file(ARGV[0]) || {}
  miss = []
  (c["skills"] || []).each do |s|
    next unless s["enabled"]
    (s["env"] || {}).each_value do |v|
      v.to_s.scan(/\$\{([A-Z0-9_]+)\}/).flatten.each { |k| miss << k }
    end
  end
  miss.uniq.each do |k|
    val = ENV[k]
    puts k if val.nil? || val.strip.empty?
  end
' "$CATALOG_PATH")"

if [[ -n "$missing_vars" ]]; then
  echo "[sync-config] missing required env vars:" >&2
  while IFS= read -r k; do
    echo "  - $k" >&2
  done <<< "$missing_vars"
  exit 1
fi

entries_json_file="$(mktemp)"
ruby -ryaml -rjson -e '
  c = YAML.load_file(ARGV[0]) || {}
  out = {}
  (c["skills"] || []).each do |s|
    name = s["name"]
    next if name.nil? || name.empty?

    entry = { "enabled" => !!s["enabled"] }
    env = s["env"] || {}
    unless env.empty?
      rendered = {}
      env.each do |k, v|
        rendered[k] = v.to_s.gsub(/\$\{([A-Z0-9_]+)\}/) { ENV[$1] || "" }
      end
      entry["env"] = rendered
    end

    out[name] = entry
  end
  puts JSON.pretty_generate(out)
' "$CATALOG_PATH" > "$entries_json_file"

mkdir -p "$(dirname "$TARGET_CONFIG")"
mkdir -p "$BACKUP_ROOT"

if [[ -f "$TARGET_CONFIG" ]]; then
  ts="$(date +%Y%m%d-%H%M%S)"
  backup_dir="$BACKUP_ROOT/$ts"
  mkdir -p "$backup_dir"
  cp "$TARGET_CONFIG" "$backup_dir/openclaw.json"
  echo "[sync-config] backup created: $backup_dir/openclaw.json"
fi

tmp_target="$(mktemp)"
if [[ -f "$TARGET_CONFIG" ]]; then
  cp "$TARGET_CONFIG" "$tmp_target"
else
  echo '{}' > "$tmp_target"
fi

tmp_out="$(mktemp)"
jq \
  --slurpfile base "$BASE_CONFIG_PATH" \
  --slurpfile entries "$entries_json_file" \
  --slurpfile patch "$PATCH_PATH" '
  def dmerge(a; b):
    reduce (b | keys_unsorted[]) as $k (a;
      .[$k] = (
        if (a[$k] | type) == "object" and (b[$k] | type) == "object"
        then dmerge(a[$k]; b[$k])
        else b[$k]
        end
      )
    );

  (($base[0] // {}) as $b |
   ($patch[0] // {}) as $p |
   ($entries[0] // {}) as $e |
   (. // {}) as $orig |
   dmerge(dmerge($orig; $b); $p)
   | .skills = (.skills // {})
   | .skills.entries = ((.skills.entries // {}) + $e)
  )
' "$tmp_target" > "$tmp_out"

mv "$tmp_out" "$TARGET_CONFIG"
chmod 600 "$TARGET_CONFIG" || true

rm -f "$entries_json_file" "$tmp_target" "$tmp_empty_json"
echo "[sync-config] wrote $TARGET_CONFIG"
