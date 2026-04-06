# Subagent Wait And Parent Resume Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let a `subagent` node optionally wait for its child run to finish, then resume the parent run with the child outcome and child output artifacts folded back into parent context.

**Architecture:** Keep child-run creation in the worker-owned `subagent` handler, but extend the workflow engine with a dedicated `waiting_for_subagent` pause state and a resume payload for child completion. Persist pending child-run ids in workflow engine state, have completed child runs wake their waiting parent, and treat child output artifacts as additional parent inputs on resume.

**Tech Stack:** TypeScript, Node.js, Vitest, React, SQLite-backed agent store

---

### Task 1: Add Red Tests For Awaited Subagents

**Files:**
- Modify: `packages/agent-core/test/workflow-engine.test.ts`
- Modify: `packages/agent-store/test/run-store.test.ts`
- Modify: `apps/worker/test/run-loop-subagent.test.ts`
- Modify: `apps/web/src/state/chat-send-flow.test.ts`

**Step 1: Write the failing engine wait/resume test**

Assert that when a node handler returns `spawn_subagent` with `waitForCompletion: true`, the engine:
- returns `waiting_for_subagent`
- stores the pending child run id in state
- resumes to completion after a child-resolution payload

**Step 2: Write the failing engine-state persistence test**

Assert that SQLite-backed engine state records persist a pending child run id across store reopen.

**Step 3: Write the failing worker parent-resume test**

Assert that an awaited `subagent` node:
- leaves the parent run in `waiting_for_subagent`
- wakes the parent after the child run completes
- resumes the parent to completion
- merges the child run output artifact ids into the parent run input artifacts

**Step 4: Write the failing web status handling test**

Assert that `waiting_for_subagent` is treated as a guard/in-progress assistant result rather than a success result.

**Step 5: Run the targeted tests to verify failure**

Run:

```bash
pnpm test -- packages/agent-core/test/workflow-engine.test.ts packages/agent-store/test/run-store.test.ts apps/worker/test/run-loop-subagent.test.ts apps/web/src/state/chat-send-flow.test.ts
```

### Task 2: Teach Protocol, Engine, And Store About Subagent Wait State

**Files:**
- Modify: `packages/agent-protocol/src/run.ts`
- Modify: `packages/agent-core/src/engine/node-runner.ts`
- Modify: `packages/agent-core/src/engine/status-machine.ts`
- Modify: `packages/agent-core/src/engine/workflow-engine.ts`
- Modify: `packages/agent-store/src/repos/engine-state-repo.ts`
- Modify: `packages/agent-store/src/index.ts`
- Modify: `packages/agent-store/src/schema.sql`
- Modify: `packages/agent-store/src/sqlite-store.ts`

**Step 1: Extend the run and engine contracts**

Add `waiting_for_subagent` to run/engine statuses, let `spawn_subagent` carry `waitForCompletion`, and add a child-run resume payload to engine resume input.

**Step 2: Persist pending child-run ids**

Extend in-memory and SQLite engine-state repos so a waiting parent can store either a pending checkpoint id or a pending child run id.

**Step 3: Resume the engine from child completion**

Make awaited subagents append `subagent.waiting`, resume with `subagent.completed` on successful child completion, and fail the parent if the child completes in a terminal non-success status.

### Task 3: Wake Parents From The Worker And Fold Child Outputs Back In

**Files:**
- Modify: `apps/worker/src/run-loop.ts`
- Modify: `apps/worker/test/run-loop-subagent.test.ts`
- Modify: `apps/worker/test/run-loop.test.ts`

**Step 1: Add awaited subagent behavior to the worker handler**

Read `node.config.awaitCompletion === true` and return a waiting subagent result while keeping the existing detached behavior when the flag is absent.

**Step 2: Rehydrate parents waiting on child runs**

Teach the run loop to resume `waiting_for_subagent` runs once the stored child run reaches a terminal status.

**Step 3: Wake the parent when the child finishes**

When a child run with `parentRunId` reaches a terminal status, enqueue its parent so another worker tick can resume it.

**Step 4: Merge child outputs into parent context**

Before resuming the parent, merge the child run `outputArtifactIds` into the parent run `inputArtifactIds` without duplicates.

### Task 4: Update Web Guard Semantics And Verify

**Files:**
- Modify: `apps/web/src/state/chat-send-flow.ts`
- Modify: `apps/web/src/state/chat-send-flow.test.ts`

**Step 1: Treat subagent wait as an in-progress guard**

Update the run-status guard logic so `waiting_for_subagent` behaves like other in-progress states.

**Step 2: Run targeted verification**

Run:

```bash
pnpm test -- packages/agent-core/test/workflow-engine.test.ts packages/agent-store/test/run-store.test.ts apps/worker/test/run-loop.test.ts apps/worker/test/run-loop-subagent.test.ts apps/web/src/state/chat-send-flow.test.ts tests/workspace/architecture-budgets.test.ts
```

**Step 3: Run fresh repo verification**

Run:

```bash
pnpm verify:architecture
pnpm test:e2e
```
