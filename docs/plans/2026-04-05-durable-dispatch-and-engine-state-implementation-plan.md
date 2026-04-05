# Durable Dispatch And Engine State Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the worker's in-memory queue and paused checkpoint state with store-backed dispatch and durable workflow engine state so runs can survive control-plane or worker restarts.

**Architecture:** Keep the existing `AgentStore` as the shared platform ledger and extend it with two new durable concerns: runnable dispatches and resumable workflow engine state. Control-plane will enqueue runs into the shared store and may still drive an inline worker by default for local development, but the worker runtime itself will read work and resume checkpoints from the same durable substrate so a standalone worker process becomes possible without changing run semantics.

**Tech Stack:** TypeScript, Node.js, Fastify, Node `node:sqlite`, Vitest, Playwright

---

### Task 1: Add Red Tests For Durable Dispatch And Resume

**Files:**
- Modify: `packages/agent-store/test/run-store.test.ts`
- Modify: `apps/worker/test/run-loop.test.ts`
- Modify: `apps/control-plane/test/control-plane-context.test.ts`

**Step 1: Write the failing durable dispatch persistence test**

Create a test that enqueues a run into the SQLite-backed store, reopens the store, and asserts the next dispatch can still be claimed in FIFO order.

**Step 2: Write the failing durable engine state resume test**

Create a test that executes a workflow until it parks on a checkpoint, reopens the SQLite-backed store, resolves the checkpoint, and asserts a fresh worker runtime resumes the run to completion without relying on in-memory `pausedStates`.

**Step 3: Write the failing control-plane dispatch bootstrap test**

Assert that `createControlPlaneServices()` enqueues durable work into the shared store and that the default inline worker still consumes from the store-backed dispatch queue rather than an in-memory array.

**Step 4: Run targeted tests to verify failure**

Run:

```bash
pnpm test -- packages/agent-store/test/run-store.test.ts apps/worker/test/run-loop.test.ts apps/control-plane/test/control-plane-context.test.ts
```

### Task 2: Extend Agent Store With Dispatches And Engine State

**Files:**
- Create: `packages/agent-store/src/repos/dispatch-repo.ts`
- Create: `packages/agent-store/src/repos/engine-state-repo.ts`
- Modify: `packages/agent-store/src/index.ts`
- Modify: `packages/agent-store/src/schema.sql`
- Modify: `packages/agent-store/src/sqlite-store.ts`
- Modify: `packages/agent-store/test/run-store.test.ts`

**Step 1: Add SQLite schema for dispatches and workflow engine state**

Add tables and indexes for:
- durable runnable dispatches
- one active resumable engine state per run

Use SQLite-friendly primitives (`text`, `integer`) and preserve deterministic ordering.

**Step 2: Extend the store interfaces**

Add repo contracts that support:
- enqueueing a run dispatch
- claiming the next dispatch
- acknowledging a claimed dispatch
- upserting and deleting workflow engine state
- reading workflow engine state by run id
- fetching a checkpoint by id without scanning all statuses

**Step 3: Implement memory and SQLite adapters**

Make both store adapters support the new repos while preserving existing run/event/checkpoint/artifact/memory semantics.

**Step 4: Run targeted tests to verify they pass**

Run:

```bash
pnpm test -- packages/agent-store/test/run-store.test.ts
```

### Task 3: Refactor Worker Run Loop Around Durable Store State

**Files:**
- Modify: `apps/worker/src/run-loop.ts`
- Modify: `apps/worker/src/worker.ts`
- Modify: `apps/worker/test/run-loop.test.ts`

**Step 1: Replace the in-memory queue and checkpoint maps**

Remove `queue`, `pausedStates`, `persistedEngineEventCounts`, and `checkpointResolutions` from the worker loop. The worker should instead:
- claim work from `store.dispatches`
- load resumable workflow state from `store.engineStates`
- resume waiting runs from the resolved checkpoint stored in `store.checkpoints`

**Step 2: Persist engine state at checkpoint boundaries**

When execution pauses on a checkpoint, upsert a durable engine state snapshot containing:
- next node id
- visited node ids
- emitted event count
- spawned child run ids
- budget usage
- pending checkpoint metadata

When execution completes or fails, delete the engine state snapshot.

**Step 3: Keep event sequencing idempotent across resumes**

Persist only newly emitted engine events by comparing the stored event count from engine state instead of relying on process-local counters.

**Step 4: Run targeted tests to verify they pass**

Run:

```bash
pnpm test -- apps/worker/test/run-loop.test.ts
```

### Task 4: Move Control Plane Scheduling To Durable Dispatch

**Files:**
- Modify: `apps/control-plane/src/control-plane-context.ts`
- Modify: `apps/control-plane/src/routes/runs.ts`
- Modify: `apps/control-plane/src/routes/checkpoints.ts`
- Modify: `apps/control-plane/src/routes/browser-sessions.ts`
- Modify: `apps/control-plane/test/control-plane-context.test.ts`
- Modify: `apps/control-plane/test/runs-route.test.ts`
- Modify: `apps/control-plane/test/checkpoints-route.test.ts`

**Step 1: Enqueue work through the store**

Change `processRun`, checkpoint resolution, and browser tool result handling so the control plane writes durable dispatch records instead of pushing run ids into an in-memory queue.

**Step 2: Preserve local inline execution for dev and tests**

Keep the default local control-plane behavior that immediately drives the inline worker loop, but make it do so by consuming the same durable dispatch queue that an external worker would use.

**Step 3: Keep route behavior unchanged**

`POST /api/v3/threads/:threadId/runs`, checkpoint resolution, and browser tool result endpoints should keep their current API contract even though scheduling is now store-backed.

**Step 4: Run targeted tests to verify they pass**

Run:

```bash
pnpm test -- apps/control-plane/test/control-plane-context.test.ts apps/control-plane/test/runs-route.test.ts apps/control-plane/test/checkpoints-route.test.ts
```

### Task 5: Add Standalone Worker Bootstrap

**Files:**
- Create: `apps/worker/src/main.ts`
- Modify: `apps/worker/package.json`
- Modify: `apps/control-plane/README.md`
- Modify: `docs/plans/2026-04-05-durable-dispatch-and-engine-state-implementation-plan.md`

**Step 1: Add env-based worker bootstrap helpers**

Create a helper that builds the worker runtime from environment variables and shares the same SQLite store selection contract as the control plane.

**Step 2: Add a simple polling worker entrypoint**

Add a CLI entrypoint that:
- opens the durable store
- polls for dispatches
- processes claimed runs
- exits cleanly on process termination

Do not introduce Redis or Postgres in this slice; SQLite-backed local durability is enough.

**Step 3: Document the local platform runtime shape**

Document how to run:
- control plane with inline worker
- control plane with durable SQLite store
- standalone worker consuming the same SQLite-backed ledger

**Step 4: Run targeted tests and smoke the worker entrypoint**

Run:

```bash
pnpm test -- apps/worker/test/run-loop.test.ts apps/control-plane/test/control-plane-context.test.ts
pnpm exec tsx apps/worker/src/main.ts --help
```

### Task 6: Fresh Verification And Commit

**Files:**
- Verify only

**Step 1: Run targeted verification**

Run:

```bash
pnpm test -- packages/agent-store/test/run-store.test.ts apps/worker/test/run-loop.test.ts apps/control-plane/test/control-plane-context.test.ts apps/control-plane/test/runs-route.test.ts apps/control-plane/test/checkpoints-route.test.ts
```

**Step 2: Run repo guardrails**

Run:

```bash
pnpm verify:architecture
pnpm test:e2e
```

**Step 3: Commit**

```bash
git add packages/agent-store apps/worker apps/control-plane docs/plans/2026-04-05-durable-dispatch-and-engine-state-implementation-plan.md
git commit -m "feat: add durable run dispatch and resume state"
```
