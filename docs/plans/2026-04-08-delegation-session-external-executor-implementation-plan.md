# Delegation Session External Executor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn `acp-agent` delegation from a human-checkpoint placeholder into a real external delegation flow that can be claimed, fulfilled, and resumed through the control plane.

**Architecture:** Keep the current bundle-driven delegation manifest and worker checkpoint pause, but add a first-class delegation session layer. The worker will create delegation sessions alongside waiting checkpoints, the control plane will expose delegation session listing and result submission routes, and external-delegation result artifacts will be attached back to the parent run before resuming execution. Checkpoint metadata must also be persisted in SQLite so the delegation contract survives restarts.

**Tech Stack:** TypeScript, Node.js, Fastify, SQLite, Vitest, existing GeoHelper worker/control-plane/store packages

---

## Task 1: Persist checkpoint metadata across store backends

**Files:**
- Modify: `packages/agent-store/src/schema.sql`
- Modify: `packages/agent-store/src/sqlite-store.ts`
- Test: `packages/agent-store/test/run-store.test.ts`

**Step 1: Write the failing test**

Add a SQLite reopen test proving checkpoint `metadata` survives persistence.

**Step 2: Run the failing test**

Run: `pnpm --filter @geohelper/agent-store test -- test/run-store.test.ts`

Expected: FAIL because SQLite checkpoints currently drop `metadata`.

**Step 3: Implement the minimal schema fix**

Add `metadata_json` to the checkpoints table, wire it through row mapping and upserts, and add a lightweight schema migration for existing SQLite files.

**Step 4: Re-run the test**

Run: `pnpm --filter @geohelper/agent-store test -- test/run-store.test.ts`

Expected: PASS

## Task 2: Add delegation session persistence and worker creation

**Files:**
- Create: `packages/agent-store/src/repos/delegation-session-repo.ts`
- Modify: `packages/agent-store/src/index.ts`
- Modify: `packages/agent-store/src/sqlite-store.ts`
- Modify: `packages/agent-store/src/schema.sql`
- Modify: `apps/worker/src/run-loop.ts`
- Test: `apps/worker/test/run-loop-subagent.test.ts`
- Test: `packages/agent-store/test/run-store.test.ts`

**Step 1: Write the failing tests**

Cover:
- `acp-agent` delegation creates a persisted delegation session instead of only a checkpoint
- delegation session persistence survives SQLite reopen

**Step 2: Run the failing tests**

Run:
- `pnpm --filter @geohelper/worker test -- test/run-loop-subagent.test.ts`
- `pnpm --filter @geohelper/agent-store test -- test/run-store.test.ts`

Expected: FAIL because delegation sessions do not exist yet.

**Step 3: Implement minimal session persistence**

Add a `delegationSessions` repo with `upsertSession`, `getSession`, `listSessions`, and `deleteSession`, then create the delegation session from the worker when an `acp-agent` node pauses.

**Step 4: Re-run the tests**

Run:
- `pnpm --filter @geohelper/worker test -- test/run-loop-subagent.test.ts`
- `pnpm --filter @geohelper/agent-store test -- test/run-store.test.ts`

Expected: PASS

## Task 3: Add control-plane delegation session routes and result ingestion

**Files:**
- Create: `apps/control-plane/src/routes/delegation-sessions.ts`
- Modify: `apps/control-plane/src/server.ts`
- Modify: `apps/control-plane/src/control-plane-context.ts`
- Test: `apps/control-plane/test/delegation-sessions-route.test.ts`
- Test: `apps/control-plane/test/runs-route.test.ts`
- Test: `apps/control-plane/test/checkpoints-route.test.ts`

**Step 1: Write the failing tests**

Cover:
- listing pending delegation sessions
- submitting external-delegation completion artifacts resumes the waiting run
- delegation result artifacts are attached to the parent run and become parent inputs
- failed external delegation completion marks the session and fails the run cleanly

**Step 2: Run the failing tests**

Run: `pnpm --filter @geohelper/control-plane test -- test/delegation-sessions-route.test.ts`

Expected: FAIL because no delegation session routes or result handling exist.

**Step 3: Implement the route layer**

Add:
- `GET /api/v3/delegation-sessions`
- `GET /api/v3/delegation-sessions/:sessionId`
- `POST /api/v3/delegation-sessions/:sessionId/result`

On completion:
- write delegation artifacts onto the parent run
- merge those artifact ids into the parent run input artifacts
- resolve the underlying checkpoint
- resume the run automatically

On failure:
- persist the session failure state
- fail the parent run with a clear event trail

**Step 4: Re-run the tests**

Run: `pnpm --filter @geohelper/control-plane test -- test/delegation-sessions-route.test.ts`

Expected: PASS

## Task 4: Verification pass

**Files:**
- Modify: any touched files only if verification reveals issues

**Step 1: Run focused verification**

Run:
- `pnpm --filter @geohelper/agent-store test`
- `pnpm --filter @geohelper/worker test -- test/run-loop-subagent.test.ts test/run-loop.test.ts test/worker.test.ts`
- `pnpm --filter @geohelper/control-plane test`

**Step 2: Run cross-repo verification**

Run:
- `pnpm typecheck`
- `pnpm exec eslint packages/agent-store apps/worker apps/control-plane`

**Step 3: Fix any fallout and re-run**

Repeat focused verification until green.
