---
name: clawra-selfie
description: Generate and send Clawra selfie images through OpenClaw using a configurable provider (OpenAI, Runware, or Fal)
allowed-tools: Bash(npx:*) Bash(openclaw:*) Bash(bash:*) Read
---

# Clawra Selfie

Generate an image from a user prompt and send it via OpenClaw channels.

## Execution Rule (Important)

- Always use `scripts/clawra-selfie.sh` (or `scripts/clawra-selfie.ts`) as the single entrypoint.
- Resolve the script path from the skill directory. Do not assume the current working directory contains `scripts/`.
- Do not call provider APIs directly with `curl` in normal flow.
- Provider selection must follow environment config (`CLAWRA_IMAGE_PROVIDER`) instead of hardcoding fal/openai.

## Inputs

- `prompt`: what image to generate
- `platform`: `telegram` / `discord` / `slack` / etc.
- `target`: chat id, username, or channel id accepted by OpenClaw for that platform
- `caption` (optional): default is `Generated with CLAWRA`

## Command

```bash
SKILL_DIR="${OPENCLAW_CLAWRA_SELFIE_DIR:-$HOME/.openclaw/workspace/skills/custom/clawra-selfie}"
if [[ ! -f "$SKILL_DIR/scripts/clawra-selfie.sh" ]]; then
  SKILL_DIR="$HOME/.openclaw/skills/clawra-selfie"
fi
bash "$SKILL_DIR/scripts/clawra-selfie.sh" "<prompt>" "<platform>" "<target>" "<caption>"
```

Equivalent direct command:

```bash
SKILL_DIR="${OPENCLAW_CLAWRA_SELFIE_DIR:-$HOME/.openclaw/workspace/skills/custom/clawra-selfie}"
if [[ ! -f "$SKILL_DIR/scripts/clawra-selfie.ts" ]]; then
  SKILL_DIR="$HOME/.openclaw/skills/clawra-selfie"
fi
npx ts-node "$SKILL_DIR/scripts/clawra-selfie.ts" "<prompt>" <platform> <target> [caption]
```

## Provider Behavior

- `CLAWRA_IMAGE_PROVIDER=openai` (default)
- `CLAWRA_IMAGE_PROVIDER=runware` (fallback/manual switch)
- `CLAWRA_IMAGE_PROVIDER=fal` (fallback/manual switch)
- Model controlled by `CLAWRA_IMAGE_MODEL` (default `gpt-image-1`)
- Fal provider defaults to **reference-image lock mode** (`xai/grok-imagine-image/edit`)
- Reference image URL defaults to `https://cdn.jsdelivr.net/gh/SumeLabs/clawra@main/assets/clawra.png`
- Keys:
  - `OPENAI_API_KEY` for OpenAI
  - `RUNWARE_API_KEY` for Runware
  - `FAL_KEY` for Fal

## Reference Lock (Fal)

Optional env vars:

- `CLAWRA_REFERENCE_IMAGE`: override fixed reference image URL
- `CLAWRA_SELFIE_MODE`: `auto` (default) / `mirror` / `direct`
- `CLAWRA_USE_REFERENCE_IMAGE`: `true` (default). Set `false` to disable lock mode and use text-only generation.
- For generic status asks (e.g. "你在干嘛"), Fal auto mode injects a small composition-variation hint to reduce repeated near-identical outputs.

## Telegram Notes

- Prefer chat id as target (example: `1871908422`) for reliability.
- If `@username` fails with `chat not found`, switch to chat id.

## Troubleshooting

- `openai provider not configured`: missing `OPENAI_API_KEY`
- `runware provider not configured`: missing `RUNWARE_API_KEY`
- `billing_hard_limit_reached`: OpenAI billing limit issue (not code issue)
- `fal provider not configured`: missing `FAL_KEY`

## Expected Outcome

- Script generates image through the active provider.
- Script sends result through `openclaw message send --channel --target`.
- For OpenAI mode, errors should come from OpenAI API, not Fal.
