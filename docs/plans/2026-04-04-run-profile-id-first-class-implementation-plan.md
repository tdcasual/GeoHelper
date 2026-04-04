# Run Profile Id First-Class Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `profileId` a first-class field on platform runs so run storage, snapshots, worker execution, and console surfaces all track the selected platform profile directly.

**Architecture:** Extend the shared run protocol to persist `profileId` on every run and stop treating `agentId` / `workflowId` as the run's public identity. The control plane will create runs with `profileId`, the worker will resolve the executable workflow from its run-profile catalog, and UI/test fixtures will pivot to the new run shape.

**Tech Stack:** TypeScript, Zod, Fastify, React 19, Vitest, Playwright

---

### Task 1: Add Red Tests For The New Run Shape

**Files:**
- Modify: `packages/agent-protocol/test/platform-protocol.test.ts`
- Modify: `packages/agent-store/test/run-store.test.ts`
- Modify: `apps/web/src/test-utils/platform-run-fixture.ts`
- Modify: `apps/web/src/components/RunConsole.test.tsx`
- Modify: `apps/web/src/components/admin/RunTimelinePage.test.tsx`
- Modify: `tests/e2e/platform-run-console.spec.ts`

**Step 1: Write the failing protocol/store fixtures**

Assert that run documents now include `profileId` and no longer require `agentId` / `workflowId`.

**Step 2: Write the failing UI fixture expectations**

Assert that run console and admin timeline render `profileId` instead of the expanded legacy ids.

**Step 3: Run targeted tests to verify failure**

Run:

```bash
pnpm test -- packages/agent-protocol/test/platform-protocol.test.ts packages/agent-store/test/run-store.test.ts apps/web/src/components/RunConsole.test.tsx apps/web/src/components/admin/RunTimelinePage.test.tsx
pnpm test:e2e --grep "platform run console"
```

### Task 2: Add Red Tests For Control-Plane And Worker Resolution

**Files:**
- Modify: `apps/control-plane/test/runs-route.test.ts`
- Modify: `apps/control-plane/test/admin-runs-route.test.ts`
- Modify: `apps/control-plane/test/checkpoints-route.test.ts`
- Modify: `apps/worker/test/run-loop.test.ts`

**Step 1: Write the failing control-plane route assertions**

Assert that:
- `POST /api/v3/threads/:threadId/runs` returns `run.profileId`
- run snapshots keep `profileId`
- manually seeded runs in admin/checkpoint tests include `profileId`

**Step 2: Write the failing worker resolution test**

Assert that the worker resolves the workflow from a run-profile catalog by `run.profileId`, and fails the run when the profile is missing from the catalog.

**Step 3: Run targeted tests to verify failure**

Run:

```bash
pnpm test -- apps/control-plane/test/runs-route.test.ts apps/control-plane/test/admin-runs-route.test.ts apps/control-plane/test/checkpoints-route.test.ts apps/worker/test/run-loop.test.ts
```

### Task 3: Implement Profile-Centric Run Resolution

**Files:**
- Modify: `packages/agent-protocol/src/run.ts`
- Modify: `apps/control-plane/src/routes/runs.ts`
- Modify: `apps/worker/src/run-loop.ts`
- Modify: `apps/worker/src/worker.ts`

**Step 1: Update the shared run schema**

Make `profileId` required and remove `agentId` / `workflowId` from `RunSchema`.

**Step 2: Persist `profileId` when creating runs**

Create control-plane runs from the selected profile id and budget without expanding the legacy identity into the stored run shape.

**Step 3: Resolve workflows from the worker's profile catalog**

Pass the worker a run-profile catalog, resolve `workflowId` from `run.profileId`, and mark runs failed when the selected profile cannot be executed.

### Task 4: Verify The Cutover

**Files:**
- Verify only

**Step 1: Re-run targeted tests**

Run:

```bash
pnpm test -- packages/agent-protocol/test/platform-protocol.test.ts packages/agent-store/test/run-store.test.ts apps/control-plane/test/runs-route.test.ts apps/control-plane/test/admin-runs-route.test.ts apps/control-plane/test/checkpoints-route.test.ts apps/worker/test/run-loop.test.ts apps/web/src/components/RunConsole.test.tsx apps/web/src/components/admin/RunTimelinePage.test.tsx
pnpm test:e2e --grep "platform run console"
```

**Step 2: Re-run repo guardrails**

Run:

```bash
pnpm verify:architecture
pnpm test:e2e
```
