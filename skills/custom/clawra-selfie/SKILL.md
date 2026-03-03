---
name: clawra-selfie
description: Generate and send Clawra selfie images through OpenClaw using a configurable provider (OpenAI, Runware, or Fal)
allowed-tools: Bash(npx:*) Bash(openclaw:*) Bash(bash:*) Read
---

# Clawra Selfie

Generate an image from a user prompt and send it via OpenClaw channels.

## Execution Rule (Important)

- Always use `scripts/clawra-selfie.sh` (or `scripts/clawra-selfie.ts`) as the single entrypoint.
- Do not call provider APIs directly with `curl` in normal flow.
- Provider selection must follow environment config (`CLAWRA_IMAGE_PROVIDER`) instead of hardcoding fal/openai.

## Inputs

- `prompt`: what image to generate
- `platform`: `telegram` / `discord` / `slack` / etc.
- `target`: chat id, username, or channel id accepted by OpenClaw for that platform
- `caption` (optional): default is `Generated with CLAWRA`

## Command

```bash
bash scripts/clawra-selfie.sh "<prompt>" "<platform>" "<target>" "<caption>"
```

Equivalent direct command:

```bash
npx ts-node scripts/clawra-selfie.ts "<prompt>" <platform> <target> [caption]
```

## Provider Behavior

- `CLAWRA_IMAGE_PROVIDER=openai` (default)
- `CLAWRA_IMAGE_PROVIDER=runware` (fallback/manual switch)
- `CLAWRA_IMAGE_PROVIDER=fal` (fallback/manual switch)
- Model controlled by `CLAWRA_IMAGE_MODEL` (default `gpt-image-1`)
- Keys:
  - `OPENAI_API_KEY` for OpenAI
  - `RUNWARE_API_KEY` for Runware
  - `FAL_KEY` for Fal

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
