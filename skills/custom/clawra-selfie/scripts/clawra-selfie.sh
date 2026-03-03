#!/usr/bin/env bash
# Wrapper for Clawra selfie sender
# Usage: bash scripts/clawra-selfie.sh "<prompt>" "<platform>" "<target>" [caption]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PROMPT="${1:-}"
PLATFORM="${2:-}"
TARGET="${3:-}"
CAPTION="${4:-Generated with CLAWRA}"

if [[ -z "$PROMPT" || -z "$PLATFORM" || -z "$TARGET" ]]; then
  cat << 'USAGE'
Usage:
  bash scripts/clawra-selfie.sh "<prompt>" "<platform>" "<target>" [caption]

Examples:
  bash scripts/clawra-selfie.sh "give me a selfie in a cafe" "telegram" "1871908422"
  bash scripts/clawra-selfie.sh "send a pic wearing sunglasses" "telegram" "@my_username" "Here you go"
USAGE
  exit 1
fi

cd "$SCRIPT_DIR"
exec npx ts-node clawra-selfie.ts "$PROMPT" "$PLATFORM" "$TARGET" "$CAPTION"
