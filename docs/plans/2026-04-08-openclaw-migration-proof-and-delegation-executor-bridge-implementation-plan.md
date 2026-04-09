# OpenClaw Migration Proof And Delegation Executor Bridge Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prove that a portable GeoHelper agent bundle can be moved into an OpenClaw-style workspace with only a thin adapter, then add a real external delegation executor bridge with claim lifecycle semantics, and finally prepare the work for commit.

**Architecture:** Extend the exporter with a smoke-import validator that reads only the exported OpenClaw-friendly workspace and produces an adapter-surface report. In parallel, upgrade delegation sessions from “list + submit result” to a true external executor bridge by persisting claim metadata and exposing claim / heartbeat / release semantics before result submission. This keeps GeoHelper as the host runtime while making the migration and external-execution boundary explicit and testable.

**Tech Stack:** TypeScript, Node.js, Fastify, SQLite, Vitest, existing GeoHelper control-plane / worker / agent-store / agent-export-openclaw packages

---

## Task 1: Add an OpenClaw smoke-import proof for exported bundles

**Files:**
- Modify: `packages/agent-export-openclaw/src/export-openclaw-bundle.ts`
- Create: `packages/agent-export-openclaw/src/openclaw-smoke.ts`
- Modify: `packages/agent-export-openclaw/src/index.ts`
- Modify: `packages/agent-export-openclaw/test/export-openclaw-bundle.test.ts`
- Create: `scripts/agents/smoke-openclaw-export.mjs`

**Step 1: Write the failing test**

Cover:
- exporting a bundle and then smoke-importing the exported directory without using the original GeoHelper bundle loader
- smoke report surfaces workflow, prompts, workspace bootstrap, and host-bound adapter requirements
- script entrypoint can run export + smoke proof for a named bundle

**Step 2: Run the failing test**

Run: `pnpm --filter @geohelper/agent-export-openclaw test -- test/export-openclaw-bundle.test.ts`

Expected: FAIL because no smoke-import validator or script exists yet.

**Step 3: Implement the minimal proof**

Add:
- `smokeImportOpenClawWorkspace()` that reads `agent.json`, referenced JSON assets, workspace bootstrap files, prompt files, and compatibility report from the exported directory
- a report that makes thin-adapter requirements explicit
- a repo script that exports a named bundle, smoke-imports it, and prints a JSON proof summary

**Step 4: Re-run the test**

Run: `pnpm --filter @geohelper/agent-export-openclaw test -- test/export-openclaw-bundle.test.ts`

Expected: PASS

## Task 2: Add delegation external executor claim lifecycle

**Files:**
- Modify: `packages/agent-store/src/repos/delegation-session-repo.ts`
- Modify: `packages/agent-store/src/schema.sql`
- Modify: `packages/agent-store/src/index.ts`
- Modify: `packages/agent-store/src/sqlite-store.ts`
- Modify: `packages/agent-store/test/run-store.test.ts`
- Modify: `apps/control-plane/src/routes/delegation-sessions.ts`
- Modify: `apps/control-plane/test/delegation-sessions-route.test.ts`

**Step 1: Write the failing tests**

Cover:
- external executors can claim the next eligible delegation session
- claimed sessions cannot be double-claimed while the lease is active
- executors can heartbeat or release a claim
- result submission respects claim ownership when a claim exists
- claim metadata survives SQLite reopen

**Step 2: Run the failing tests**

Run:
- `pnpm --filter @geohelper/agent-store test -- test/run-store.test.ts`
- `pnpm --filter @geohelper/control-plane test -- test/delegation-sessions-route.test.ts`

Expected: FAIL because delegation sessions currently have no claim lifecycle state.

**Step 3: Implement the bridge**

Add:
- delegation session claim fields such as `claimedBy`, `claimedAt`, and `claimExpiresAt`
- route(s) for claim / heartbeat / release
- result submission validation against active claim ownership

**Step 4: Re-run the tests**

Run:
- `pnpm --filter @geohelper/agent-store test -- test/run-store.test.ts`
- `pnpm --filter @geohelper/control-plane test -- test/delegation-sessions-route.test.ts`

Expected: PASS

## Task 3: Add an executor-side bridge script

**Files:**
- Create: `scripts/agents/delegation-executor-bridge.mjs`
- Optional modify: `apps/control-plane/src/control-plane-context.ts`
- Optional tests near `apps/control-plane/test/delegation-sessions-route.test.ts` or exporter tests

**Step 1: Write the failing test**

Cover:
- a bridge script can claim a session for a target `agentRef`
- script can print a machine-readable claim payload
- script can release or submit a result using the new routes

**Step 2: Run the failing test**

Run an appropriate targeted test command for the added test file.

Expected: FAIL because the delegation bridge script does not exist yet.

**Step 3: Implement the minimal executor bridge**

Support:
- `claim-next`
- `heartbeat`
- `release`
- `submit-result`

Use plain JSON stdout so a future OpenClaw worker wrapper can call it directly.

**Step 4: Re-run the test**

Run the same targeted test command again.

Expected: PASS

## Task 4: Full verification and commit prep

**Files:**
- Modify: `docs/plans/README.md`

**Step 1: Run focused verification**

Run:
- `pnpm --filter @geohelper/agent-export-openclaw test`
- `pnpm --filter @geohelper/agent-store test`
- `pnpm --filter @geohelper/control-plane test`

**Step 2: Run cross-repo verification**

Run:
- `pnpm --filter @geohelper/worker test`
- `pnpm typecheck`
- `pnpm exec eslint packages/agent-export-openclaw packages/agent-store apps/control-plane apps/worker`

**Step 3: Update plan index**

Add this plan to `docs/plans/README.md`.

**Step 4: Prepare commit**

Summarize the migration proof, delegation bridge changes, and verification evidence before staging.
