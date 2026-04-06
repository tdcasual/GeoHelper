# Control-Plane Worker Orchestration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close the local platform execution loop so the control-plane can enqueue runs, resume checkpointed runs, and hand browser tool results back to the worker runtime without leaving runs stuck in store-only state.

**Architecture:** Keep the default developer/runtime topology simple by hosting an in-process worker runtime inside `createControlPlaneServices()`. Routes will continue to own validation and persistence, but they will now notify a shared orchestration facade that drives the existing run loop for three transitions: start run, checkpoint resolution, and browser tool completion. This keeps the API surface stable while making the current platform stack behave like an actual scheduler-backed system.

**Tech Stack:** TypeScript, Fastify, Vitest

---

### Task 1: Add Red Route Tests For Local Orchestration

**Files:**
- Modify: `apps/control-plane/test/runs-route.test.ts`
- Modify: `apps/control-plane/test/checkpoints-route.test.ts`

**Step 1: Write the failing start-run orchestration test**

Assert that creating a run still returns `202`, but the subsequent `/api/v3/runs/:runId/stream` snapshot now reflects worker progress rather than a forever-queued run.

**Step 2: Write the failing checkpoint resume test**

Build a minimal custom platform runtime with a `planner -> checkpoint -> synthesizer` workflow, start a run through the real route, resolve the checkpoint, and assert the streamed snapshot advances to `completed`.

**Step 3: Write the failing browser tool resume test**

Build a minimal custom platform runtime with a `tool(browser_tool) -> synthesizer` workflow, start a run, post a valid browser tool result, and assert the run snapshot advances past the tool checkpoint.

**Step 4: Run targeted tests to verify failure**

Run:

```bash
pnpm test -- apps/control-plane/test/runs-route.test.ts apps/control-plane/test/checkpoints-route.test.ts
```

### Task 2: Add A Control-Plane Orchestration Facade

**Files:**
- Modify: `apps/control-plane/src/control-plane-context.ts`
- Modify: `apps/control-plane/src/routes/runs.ts`
- Modify: `apps/control-plane/src/routes/checkpoints.ts`
- Modify: `apps/control-plane/src/routes/browser-sessions.ts`
- Modify: `apps/control-plane/package.json`
- Modify: `apps/worker/src/run-loop.ts`
- Modify: `apps/worker/src/worker.ts`

**Step 1: Expose a worker-backed orchestration helper from control-plane services**

Create a default in-process worker runtime that shares the control-plane store and platform runtime, then expose small service methods such as:
- `processRun(runId)`
- `resumeCheckpoint({ runId, checkpointId, response })`
- `submitBrowserToolResult({ runId, checkpointId, output })`

**Step 2: Generalize the run loop resume path**

Extend the worker run loop so paused runs can resume from any checkpoint resolution payload, while preserving the existing browser-tool convenience method.

**Step 3: Wire routes into orchestration**

- `POST /api/v3/threads/:threadId/runs` should enqueue and process the run after persisting it.
- `POST /api/v3/checkpoints/:checkpointId/resolve` should persist the resolved checkpoint, notify the worker runtime, and continue execution.
- `POST /api/v3/browser-sessions/:sessionId/tool-results` should validate the session, find the pending tool-result checkpoint for the run, submit it to the worker runtime, and continue execution.

### Task 3: Verify And Commit

**Files:**
- Verify only

**Step 1: Re-run targeted tests**

Run:

```bash
pnpm test -- apps/control-plane/test/runs-route.test.ts apps/control-plane/test/checkpoints-route.test.ts
```

**Step 2: Re-run repo guardrails**

Run:

```bash
pnpm verify:architecture
pnpm test:e2e
```
