# Thread Session And Incremental Stream Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist control-plane threads and browser sessions in the shared agent store, and replace the current one-shot run snapshot endpoint with a cursor-based incremental SSE stream that web clients can replay from durable run events.

**Architecture:** Extend the existing `AgentStore` with durable thread and browser-session repos so control-plane state no longer depends on in-memory `Map`s. Keep the current `/api/v3/runs/:runId/stream` endpoint shape, but make it emit an initial `run.snapshot` frame plus ordered `run.event` frames after a cursor so clients can reconnect and rebuild state from the durable ledger instead of relying on a single full snapshot response.

**Tech Stack:** TypeScript, Node.js, Fastify, Node `node:sqlite`, Vitest, React, Zustand

---

### Task 1: Add Red Tests For Durable Threads, Sessions, And Incremental Stream

**Files:**
- Modify: `packages/agent-store/test/run-store.test.ts`
- Modify: `apps/control-plane/test/runs-route.test.ts`
- Modify: `apps/control-plane/test/checkpoints-route.test.ts`
- Modify: `apps/web/src/runtime/control-plane-client.test.ts`

**Step 1: Write the failing thread persistence test**

Create a SQLite-backed store test that writes a thread, reopens the store, and asserts it can still be fetched and listed.

**Step 2: Write the failing browser-session persistence test**

Create a SQLite-backed store test that writes a browser session, reopens the store, and asserts tool permissions and run binding are preserved.

**Step 3: Write the failing incremental stream route test**

Update the control-plane stream test so `/api/v3/runs/:runId/stream?afterSequence=1` must:
- emit `event: run.snapshot`
- emit one or more `event: run.event` frames
- only include events with `sequence > 1`

**Step 4: Write the failing client parsing test**

Assert that the web control-plane client parses the incremental stream into:
- current run snapshot metadata
- streamed run events
- latest cursor / last sequence

**Step 5: Run targeted tests to verify failure**

Run:

```bash
pnpm test -- packages/agent-store/test/run-store.test.ts apps/control-plane/test/runs-route.test.ts apps/control-plane/test/checkpoints-route.test.ts apps/web/src/runtime/control-plane-client.test.ts
```

### Task 2: Add Durable Thread And Browser Session Repos

**Files:**
- Create: `packages/agent-store/src/repos/thread-repo.ts`
- Create: `packages/agent-store/src/repos/browser-session-repo.ts`
- Modify: `packages/agent-store/src/index.ts`
- Modify: `packages/agent-store/src/schema.sql`
- Modify: `packages/agent-store/src/sqlite-store.ts`
- Modify: `packages/agent-store/test/run-store.test.ts`

**Step 1: Define repo contracts**

Add store repos for:
- create/get/list threads
- create/get/delete browser sessions

Keep the contracts minimal and aligned with current route needs.

**Step 2: Add SQLite schema**

Create tables and indexes for:
- `threads`
- `browser_sessions`

Use foreign keys from browser sessions to runs and deterministic ordering for list operations.

**Step 3: Implement memory and SQLite adapters**

Extend both store adapters so they support the new repos without changing existing run/event/checkpoint/artifact/memory behavior.

**Step 4: Run targeted tests to verify they pass**

Run:

```bash
pnpm test -- packages/agent-store/test/run-store.test.ts
```

### Task 3: Move Control Plane Off In-Memory Thread And Session Maps

**Files:**
- Modify: `apps/control-plane/src/control-plane-context.ts`
- Modify: `apps/control-plane/src/routes/threads.ts`
- Modify: `apps/control-plane/src/routes/runs.ts`
- Modify: `apps/control-plane/src/routes/browser-sessions.ts`
- Modify: `apps/control-plane/test/runs-route.test.ts`
- Modify: `apps/control-plane/test/checkpoints-route.test.ts`

**Step 1: Stop treating threads and browser sessions as process-local maps**

Change thread creation and browser session creation/lookup to use the shared store repos.

**Step 2: Keep route contracts stable**

Do not change route payloads for:
- `POST /api/v3/threads`
- `POST /api/v3/browser-sessions`
- `POST /api/v3/browser-sessions/:sessionId/tool-results`

Only the persistence source should change.

**Step 3: Run targeted tests to verify they pass**

Run:

```bash
pnpm test -- apps/control-plane/test/runs-route.test.ts apps/control-plane/test/checkpoints-route.test.ts
```

### Task 4: Upgrade Run Stream To Cursor-Based Incremental SSE

**Files:**
- Modify: `apps/control-plane/src/routes/stream.ts`
- Modify: `apps/control-plane/test/runs-route.test.ts`
- Modify: `apps/control-plane/test/checkpoints-route.test.ts`
- Modify: `apps/web/src/runtime/control-plane-client.ts`
- Modify: `apps/web/src/runtime/control-plane-client.test.ts`
- Modify: `apps/web/src/runtime/platform-runner.ts`
- Modify: `apps/web/src/runtime/platform-runner.test.ts`

**Step 1: Define the stream contract**

Support query parameters:
- `afterSequence` defaulting to `0`

Emit:
- one `run.snapshot` frame with run/checkpoints/artifacts/memory state
- zero or more `run.event` frames for events after the cursor

Close the response after replaying the current durable ledger.

**Step 2: Parse incremental frames on the web client**

Teach the control-plane client to parse both snapshot and event frames, then rebuild a `RunSnapshot` value for current callers.

**Step 3: Preserve current web flow**

Keep `submitPromptToPlatform()` returning a `RuntimeRunResponse`, but make its data come from the incremental stream parser rather than assuming a single snapshot frame.

**Step 4: Run targeted tests to verify they pass**

Run:

```bash
pnpm test -- apps/web/src/runtime/control-plane-client.test.ts apps/web/src/runtime/platform-runner.test.ts apps/control-plane/test/runs-route.test.ts
```

### Task 5: Fresh Verification And Commit

**Files:**
- Verify only

**Step 1: Run targeted verification**

Run:

```bash
pnpm test -- packages/agent-store/test/run-store.test.ts apps/control-plane/test/runs-route.test.ts apps/control-plane/test/checkpoints-route.test.ts apps/web/src/runtime/control-plane-client.test.ts apps/web/src/runtime/platform-runner.test.ts
```

**Step 2: Run repo guardrails**

Run:

```bash
pnpm verify:architecture
pnpm test:e2e
```

**Step 3: Commit**

```bash
git add packages/agent-store apps/control-plane apps/web docs/plans/2026-04-05-thread-session-and-incremental-stream-implementation-plan.md
git commit -m "feat: persist threads and add incremental run stream"
```
