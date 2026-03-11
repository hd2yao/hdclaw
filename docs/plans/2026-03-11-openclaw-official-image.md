# OpenClaw Official Image Variant Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a new Docker stack that keeps the current `openclaw-fresh` stack intact while rebuilding the environment on top of the official OpenClaw image.

**Architecture:** Create a parallel `containers/openclaw-official/` stack. Its Dockerfile will `FROM` the official image, then layer in the same runtime dependencies and repo-managed scripts already used by `openclaw-fresh`. Reuse the existing bootstrap script with `DOCKER_STACK=openclaw-official` so behavior stays aligned across both stacks.

**Tech Stack:** Docker Compose, Dockerfile, bash bootstrap script, OpenClaw CLI/runtime.

---

### Task 1: Add the official-image Docker stack

**Files:**
- Create: `containers/openclaw-official/Dockerfile`
- Create: `containers/openclaw-official/docker-compose.yml`

**Step 1: Define the base image**

Use a build arg so the official image can be pinned later:

```dockerfile
ARG OPENCLAW_OFFICIAL_IMAGE=ghcr.io/openclaw/openclaw:latest
FROM ${OPENCLAW_OFFICIAL_IMAGE}
```

**Step 2: Layer in the current runtime dependencies**

Install the same Debian packages needed by the current workflow:

- `sudo`
- `python3`
- `python3-pip`
- Playwright shared libraries

**Step 3: Reuse the existing runtime scripts**

Copy:

- `containers/openclaw-fresh/openclaw-container-init.sh`
- `scripts/sglang-toolcall-adapter.mjs`

**Step 4: Preserve runtime identity**

Keep:

- `HOME=/home/node`
- `WORKDIR /home/node/workspace`
- `USER node`

**Step 5: Verify compose renders**

Run:

```bash
docker compose -f containers/openclaw-official/docker-compose.yml config
```

Expected: exit `0`.

### Task 2: Expose official-stack commands

**Files:**
- Modify: `Makefile`
- Modify: `.env.example`

**Step 1: Add a dedicated bootstrap target**

Add:

```makefile
docker-official-bootstrap:
	DOCKER_STACK=openclaw-official ...
```

**Step 2: Document the official image override**

Add:

```dotenv
OPENCLAW_OFFICIAL_IMAGE=ghcr.io/openclaw/openclaw:latest
```

**Step 3: Verify make target syntax**

Run:

```bash
make -n docker-official-bootstrap
```

Expected: prints the command without errors.

### Task 3: Document how to use the official variant

**Files:**
- Create: `docs/openclaw-official-docker-oneclick.md`
- Modify: `README.md`

**Step 1: Add a focused runbook**

Document:

- what "official image variant" means
- how it differs from `openclaw-fresh`
- startup commands
- bootstrap command
- where custom layers are added

**Step 2: Link it from the README**

Add usage examples:

```bash
DOCKER_STACK=openclaw-official make docker-up
make docker-official-bootstrap
```

**Step 3: Verify docs references**

Run:

```bash
rg -n "openclaw-official|OPENCLAW_OFFICIAL_IMAGE" README.md docs .env.example Makefile containers/openclaw-official
```

Expected: all new entry points are discoverable.
