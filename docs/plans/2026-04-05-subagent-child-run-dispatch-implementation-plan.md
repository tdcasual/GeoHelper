# Subagent Child Run Dispatch Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `subagent` workflow nodes create durable child runs that carry `parentRunId`, get enqueued for worker execution, and can be queried from admin surfaces.

**Architecture:** Keep the workflow engine's current `spawn_subagent` event model, but teach the worker-owned `subagent` handler to materialize a child run in the shared store and enqueue it exactly once. Extend run-list filtering so control-plane admin routes can inspect run trees by `parentRunId`.

**Tech Stack:** TypeScript, Node.js, Vitest, Fastify, SQLite-backed agent store

---

### Task 1: Add Red Tests For Child Run Spawn And Parent Filtering

**Files:**
- Modify: `packages/agent-store/test/run-store.test.ts`
- Modify: `apps/control-plane/test/admin-runs-route.test.ts`
- Modify: `apps/worker/test/run-loop.test.ts`

**Step 1: Write the failing store filter test**

Assert that `listRuns({ parentRunId })` works after reopening the SQLite store.

**Step 2: Write the failing admin runs filter test**

Assert that `GET /admin/runs?parentRunId=run_parent` only returns child runs for that parent.

**Step 3: Write the failing worker subagent spawn test**

Assert that a `subagent` node:
- creates a child run with `parentRunId`
- preserves thread binding
- enqueues the child run for later execution

**Step 4: Run targeted tests to verify failure**

Run:

```bash
pnpm test -- packages/agent-store/test/run-store.test.ts apps/control-plane/test/admin-runs-route.test.ts apps/worker/test/run-loop.test.ts
```

### Task 2: Add Parent Run Filtering To The Store And Admin Routes

**Files:**
- Modify: `packages/agent-store/src/repos/run-repo.ts`
- Modify: `packages/agent-store/src/index.ts`
- Modify: `packages/agent-store/src/sqlite-store.ts`
- Modify: `apps/control-plane/src/routes/admin-runs.ts`

**Step 1: Extend the run filter contract**

Add `parentRunId` filtering to the run repo and keep existing status filtering intact.

**Step 2: Wire both store adapters**

Support the filter in both memory and SQLite stores so admin behavior matches durable behavior.

**Step 3: Expose the filter from admin routes**

Teach `/admin/runs` to accept `parentRunId` without changing the response shape.

### Task 3: Materialize Subagent Child Runs In The Worker

**Files:**
- Modify: `apps/worker/src/run-loop.ts`
- Modify: `apps/worker/test/run-loop.test.ts`

**Step 1: Add a worker-owned subagent handler**

When a workflow node is `subagent`, create a child run in the shared store using:
- `parentRunId = parent run id`
- `threadId = parent thread id`
- `profileId = node.config.runProfileId`

**Step 2: Enqueue the child run durably**

Enqueue the child run once so it is available to the same worker or another worker on the next tick.

**Step 3: Keep the parent execution contract stable**

Parent runs should still emit `subagent.spawned` and continue with the current workflow semantics for now.

### Task 4: Verify

**Step 1: Run targeted tests**

```bash
pnpm test -- packages/agent-store/test/run-store.test.ts apps/control-plane/test/admin-runs-route.test.ts apps/worker/test/run-loop.test.ts
```

**Step 2: Run fresh repo verification**

```bash
pnpm verify:architecture
pnpm test:e2e
```
