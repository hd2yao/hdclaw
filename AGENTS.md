# OpenClaw Repo Agent Notes

## Scope
This repository is the single source of truth for local OpenClaw setup:
- non-sensitive base config templates
- custom and pinned skills
- install/sync/verify scripts

## Safety
- Never commit `.env.local`.
- Never write plaintext secrets into repository files.
- Runtime config output is `~/.openclaw/openclaw.json`.

## Fast commands
- `make bootstrap`
- `make sync`
- `make install-skills`
- `make verify`
- `make doctor`
