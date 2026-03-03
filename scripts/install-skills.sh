#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CATALOG_PATH="${CATALOG_PATH:-$ROOT_DIR/skills/catalog.yaml}"
DEST_DIR="${OPENCLAW_SKILLS_DIR:-$HOME/.openclaw/skills}"
FAIL_FAST="${FAIL_FAST:-false}"
INSTALL_ONLINE="${INSTALL_ONLINE:-true}"

if [[ ! -f "$CATALOG_PATH" ]]; then
  echo "[install-skills] catalog not found: $CATALOG_PATH" >&2
  exit 1
fi

mkdir -p "$DEST_DIR"

run_or_warn() {
  local cmd="$1"
  if ! eval "$cmd"; then
    if [[ "$FAIL_FAST" == "true" ]]; then
      return 1
    fi
    echo "[install-skills] warning: command failed: $cmd" >&2
  fi
}

ruby -ryaml -e '
  c = YAML.load_file(ARGV[0]) || {}
  skills = c.fetch("skills", [])
  skills.each do |s|
    puts [s["name"], s["kind"], s["source"], s["install"] || "copy", s["enabled"], s["channel"] || "", s["version"] || ""].join("\t")
  end
' "$CATALOG_PATH" | while IFS=$'\t' read -r name kind source install enabled channel version; do
  [[ "$enabled" == "true" ]] || continue

  case "$kind" in
    custom)
      run_or_warn "bash '$ROOT_DIR/scripts/link-custom-skills.sh' '$name' '$source' '$install'"
      ;;
    oss-pinned)
      if [[ "$source" == ./* ]]; then
        src="$ROOT_DIR/${source#./}"
      elif [[ "$source" == /* ]]; then
        src="$source"
      else
        src="$ROOT_DIR/$source"
      fi

      if [[ ! -d "$src" ]]; then
        echo "[install-skills] warning: pinned source missing for $name: $src" >&2
        [[ "$FAIL_FAST" == "true" ]] && exit 1
        continue
      fi

      dst="$DEST_DIR/$name"
      rm -rf "$dst"
      if [[ "$install" == "symlink" ]]; then
        ln -s "$src" "$dst"
      else
        cp -R "$src" "$dst"
      fi
      echo "[install-skills] installed pinned $name ($install)"
      ;;
    oss-online)
      if [[ "$INSTALL_ONLINE" != "true" ]]; then
        echo "[install-skills] skip online install for $name (INSTALL_ONLINE=false)"
        continue
      fi

      if [[ "$channel" == "clawhub" ]]; then
        if command -v clawhub >/dev/null 2>&1; then
          run_or_warn "clawhub install '$name'"
        else
          run_or_warn "npx clawhub install '$name'"
        fi
      else
        echo "[install-skills] warning: unsupported online channel for $name: $channel" >&2
        [[ "$FAIL_FAST" == "true" ]] && exit 1
      fi
      ;;
    *)
      echo "[install-skills] warning: unknown kind for $name: $kind" >&2
      [[ "$FAIL_FAST" == "true" ]] && exit 1
      ;;
  esac
done

echo "[install-skills] done"
