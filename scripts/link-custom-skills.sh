#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "usage: $0 <name> <source> [install_mode]" >&2
  exit 1
fi

NAME="$1"
SOURCE="$2"
INSTALL_MODE="${3:-symlink}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "$SOURCE" == ./* ]]; then
  SRC_PATH="$ROOT_DIR/${SOURCE#./}"
elif [[ "$SOURCE" == /* ]]; then
  SRC_PATH="$SOURCE"
else
  SRC_PATH="$ROOT_DIR/$SOURCE"
fi

DEST_DIR="${OPENCLAW_SKILLS_DIR:-$HOME/.openclaw/skills}"
DEST_PATH="$DEST_DIR/$NAME"

if [[ ! -d "$SRC_PATH" ]]; then
  echo "[link-custom-skills] source directory not found: $SRC_PATH" >&2
  exit 1
fi
if [[ ! -f "$SRC_PATH/SKILL.md" ]]; then
  echo "[link-custom-skills] SKILL.md missing in: $SRC_PATH" >&2
  exit 1
fi

mkdir -p "$DEST_DIR"
rm -rf "$DEST_PATH"

case "$INSTALL_MODE" in
  symlink)
    ln -s "$SRC_PATH" "$DEST_PATH"
    ;;
  copy)
    cp -R "$SRC_PATH" "$DEST_PATH"
    ;;
  *)
    echo "[link-custom-skills] unsupported install mode: $INSTALL_MODE" >&2
    exit 1
    ;;
esac

echo "[link-custom-skills] installed $NAME -> $DEST_PATH ($INSTALL_MODE)"
