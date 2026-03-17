# OpenClaw Dashboard Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate the existing dashboard project out of the running Docker container into this repository, make it start on the host machine, and verify it against the `openclaw-official-openclaw-1` OpenClaw gateway.

**Architecture:** Keep the dashboard as an independent subproject under `projects/openclaw-dashboard/`. Preserve the existing backend/frontend split, repair the broken host startup path, and point the dashboard to the host-mapped OpenClaw gateway URL instead of container bridge IPs.

**Tech Stack:** Node.js, TypeScript, React, Vite, Express, better-sqlite3, Docker Compose

---

### Task 1: Import the dashboard source into the repository

**Files:**
- Create: `projects/openclaw-dashboard/**`
- Modify: `README.md`
- Modify: `docs/runbook.md` or project-specific docs if needed

**Step 1: Capture the source tree from the container**

Run: `docker exec openclaw-official-openclaw-1 sh -lc 'find /home/node/.openclaw/workspace/projects/openclaw-dashboard -maxdepth 3 | sort'`

Expected: the complete project layout is visible.

**Step 2: Copy the project into the repo**

Run: `docker cp openclaw-official-openclaw-1:/home/node/.openclaw/workspace/projects/openclaw-dashboard ./projects/openclaw-dashboard`

Expected: files appear under `projects/openclaw-dashboard`.

**Step 3: Review imported files**

Run: `find projects/openclaw-dashboard -maxdepth 3 | sort`

Expected: backend, frontend, docker, and docs are present.

**Step 4: Commit**

```bash
git add projects/openclaw-dashboard README.md docs/runbook.md
git commit -m "feat: import openclaw dashboard project"
```

### Task 2: Reproduce the broken startup path with a failing test or command

**Files:**
- Create: `projects/openclaw-dashboard/tests/smoke/startup.smoke.sh`
- Test: `projects/openclaw-dashboard/tests/smoke/startup.smoke.sh`

**Step 1: Write the failing startup smoke script**

The script should:
- check frontend dependency resolution with `npm ls vite @vitejs/plugin-react --depth=0`
- probe backend and frontend local ports
- fail if either service cannot start

**Step 2: Run it to verify failure**

Run: `bash projects/openclaw-dashboard/tests/smoke/startup.smoke.sh`

Expected: FAIL because the imported project does not yet have a working host startup path.

**Step 3: Commit**

```bash
git add projects/openclaw-dashboard/tests/smoke/startup.smoke.sh
git commit -m "test: add dashboard startup smoke check"
```

### Task 3: Repair frontend dependency installation and host startup

**Files:**
- Modify: `projects/openclaw-dashboard/frontend/package.json`
- Modify: `projects/openclaw-dashboard/frontend/package-lock.json`
- Modify: `projects/openclaw-dashboard/frontend/vite.config.ts`
- Modify: `projects/openclaw-dashboard/README.md`

**Step 1: Verify the frontend smoke failure is caused by missing dependencies**

Run: `cd projects/openclaw-dashboard/frontend && npm ls vite @vitejs/plugin-react --depth=0`

Expected: FAIL or missing packages.

**Step 2: Install or reconcile frontend dependencies**

Run: `cd projects/openclaw-dashboard/frontend && npm install`

Expected: `vite` and `@vitejs/plugin-react` are present.

**Step 3: Re-run the dependency check**

Run: `cd projects/openclaw-dashboard/frontend && npm ls vite @vitejs/plugin-react --depth=0`

Expected: PASS.

**Step 4: Start the frontend locally and verify port 5173**

Run: `cd projects/openclaw-dashboard/frontend && npm run dev -- --host 127.0.0.1`

Expected: Vite serves successfully on `127.0.0.1:5173`.

**Step 5: Commit**

```bash
git add projects/openclaw-dashboard/frontend/package.json projects/openclaw-dashboard/frontend/package-lock.json projects/openclaw-dashboard/frontend/vite.config.ts projects/openclaw-dashboard/README.md
git commit -m "fix: restore dashboard frontend host startup"
```

### Task 4: Repair backend snapshot handling against real OpenClaw data

**Files:**
- Modify: `projects/openclaw-dashboard/src/services/nodeManager.ts`
- Modify: `projects/openclaw-dashboard/src/services/wsGateway.ts`
- Modify: `projects/openclaw-dashboard/src/db/repositories/telemetryRepository.ts`
- Create or Modify: backend tests near the affected modules

**Step 1: Write a failing test for real snapshot ingestion**

Use a fixture derived from the actual OpenClaw node response and assert:
- agent records can be persisted without missing parameter errors
- websocket payloads are JSON serializable

**Step 2: Run the specific test to verify failure**

Run the project-appropriate test command for the new test file.

Expected: FAIL with the current `agentId` mapping or serialization bug.

**Step 3: Implement the minimal backend fix**

Adjust snapshot mapping and websocket broadcast payload shaping until the test passes.

**Step 4: Run the targeted test again**

Expected: PASS.

**Step 5: Commit**

```bash
git add projects/openclaw-dashboard/src/services/nodeManager.ts projects/openclaw-dashboard/src/services/wsGateway.ts projects/openclaw-dashboard/src/db/repositories/telemetryRepository.ts
git commit -m "fix: ingest openclaw dashboard snapshots correctly"
```

### Task 5: Add host-oriented run scripts and documentation

**Files:**
- Modify: `projects/openclaw-dashboard/package.json`
- Create: `projects/openclaw-dashboard/scripts/*.sh` as needed
- Modify: `projects/openclaw-dashboard/README.md`
- Modify: root `README.md`

**Step 1: Add explicit host run commands**

Provide predictable commands for:
- backend dev
- frontend dev
- optional combined local run

**Step 2: Document the correct OpenClaw target**

Document:
- host gateway URL
- token source
- frontend URL
- backend URL

**Step 3: Verify the documented commands**

Run each documented command once or through a wrapper script.

Expected: commands start successfully.

**Step 4: Commit**

```bash
git add projects/openclaw-dashboard/package.json projects/openclaw-dashboard/scripts projects/openclaw-dashboard/README.md README.md
git commit -m "docs: add host run flow for dashboard"
```

### Task 6: Verify end-to-end against `openclaw-official-openclaw-1`

**Files:**
- Modify: `projects/openclaw-dashboard/tests/smoke/*.sh`
- Modify: docs only if the verified command differs from assumptions

**Step 1: Start the OpenClaw container if needed**

Run: `docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'`

Expected: `openclaw-official-openclaw-1` is running and port `18890` is mapped.

**Step 2: Start dashboard backend and frontend on the host**

Run the documented local commands or scripts.

Expected: backend on `127.0.0.1:3000`, frontend on `127.0.0.1:5173`.

**Step 3: Register the OpenClaw node**

Use the dashboard API against the host-mapped gateway URL, not container bridge IP.

Expected: node registration succeeds.

**Step 4: Validate overview or agents response**

Query the dashboard backend and confirm at least one real node snapshot is returned.

**Step 5: Run the smoke script**

Run: `bash projects/openclaw-dashboard/tests/smoke/startup.smoke.sh`

Expected: PASS.

**Step 6: Commit**

```bash
git add projects/openclaw-dashboard/tests/smoke
git commit -m "test: verify dashboard against docker openclaw node"
```

### Task 7: Final verification, review, and integration

**Files:**
- Review all task diffs

**Step 1: Run the fastest relevant verification**

Run all project-specific smoke or test commands created above, plus any existing relevant checks.

**Step 2: Review the diff**

Run: `git diff --check` and a focused `git diff --stat main...HEAD`

Expected: no obvious issues.

**Step 3: Push and create PR**

```bash
git push -u origin codex/openclaw-dashboard-migration
gh pr create --fill
```

**Step 4: Wait for checks and merge when green**

Use non-interactive GitHub CLI commands.
