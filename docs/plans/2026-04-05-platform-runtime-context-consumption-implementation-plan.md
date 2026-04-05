# Platform Runtime Context Consumption Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Promote the shared geometry bootstrap into a reusable platform runtime context that control-plane and worker both consume directly.

**Architecture:** Lift the generic bootstrap shape out of the geometry domain package into shared platform types, add a runtime-context helper that resolves a queued run into its profile/agent/workflow/tool/evaluator bundle, then wire control-plane and worker to expose and consume that runtime context. The worker should use the runtime context to validate registry completeness before executing a workflow so future scheduler/orchestrator components can reuse the same resolution path.

**Tech Stack:** TypeScript, Vitest, Fastify

---

### Task 1: Write Red Tests For Shared Runtime Context

**Files:**
- Create: `packages/agent-core/test/platform-runtime-context.test.ts`
- Modify: `apps/control-plane/test/control-plane-context.test.ts`
- Modify: `apps/worker/test/worker.test.ts`

**Step 1: Write the failing platform runtime context test**

Assert that a shared runtime context can:
- expose the bootstrap registries
- resolve a run by `profileId`
- return the selected profile, agent, workflow, tool definitions, and evaluator definitions
- fail with a platform-specific reason when a referenced tool or evaluator is missing

**Step 2: Write the failing control-plane services test**

Assert that `createControlPlaneServices()` exposes `platformRuntime` and that `services.runProfiles` is derived from `services.platformRuntime.runProfiles`.

**Step 3: Write the failing worker runtime test**

Assert that `createGeometryWorkerRuntime()` exposes `platformRuntime` and that `createRunLoop()` fails a queued run with a registry failure when the runtime context is incomplete.

**Step 4: Run targeted tests to verify failure**

Run:

```bash
pnpm test -- packages/agent-core/test/platform-runtime-context.test.ts apps/control-plane/test/control-plane-context.test.ts apps/worker/test/worker.test.ts
```

### Task 2: Implement Shared Platform Runtime Context

**Files:**
- Create: `packages/agent-protocol/src/platform-agent.ts`
- Create: `packages/agent-protocol/src/platform-bootstrap.ts`
- Create: `packages/agent-core/src/platform-runtime-context.ts`
- Modify: `packages/agent-protocol/src/index.ts`
- Modify: `packages/agent-core/src/index.ts`
- Modify: `packages/agent-core/src/engine/workflow-engine.ts`
- Modify: `packages/agent-domain-geometry/src/agents/geometry-solver.ts`
- Modify: `packages/agent-domain-geometry/src/platform-bootstrap.ts`
- Modify: `packages/agent-domain-geometry/src/index.ts`
- Modify: `apps/control-plane/src/control-plane-context.ts`
- Modify: `apps/worker/src/run-loop.ts`
- Modify: `apps/worker/src/worker.ts`

**Step 1: Promote shared platform types**

Move the generic agent/bootstrap contracts into shared protocol files so they no longer live inside the geometry domain package.

**Step 2: Add runtime-context resolution helper**

Build a helper that turns a bootstrap into a runtime context with a run-profile map and a `resolveRun()`-style API.

**Step 3: Consume runtime context from app runtimes**

Expose `platformRuntime` from control-plane services and worker runtime, derive `runProfiles` from it, and update the worker run loop to resolve executable context from the shared runtime helper.

### Task 3: Verify And Commit

**Files:**
- Verify only

**Step 1: Re-run targeted tests**

Run:

```bash
pnpm test -- packages/agent-core/test/platform-runtime-context.test.ts apps/control-plane/test/control-plane-context.test.ts apps/worker/test/worker.test.ts
```

**Step 2: Re-run repo guardrails**

Run:

```bash
pnpm verify:architecture
pnpm test:e2e
```
