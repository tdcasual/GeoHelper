# Run Timeline Subagent Surface Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expose child runs in the admin run timeline payload and render them in the Run Console timeline UI so durable subagents are inspectable from platform surfaces.

**Architecture:** Reuse the existing `parentRunId` filter in the store to let `/admin/runs/:runId/timeline` include direct child runs. Extend `RunTimelinePage` with a `childRuns` section that shows each subagent run id, profile, and status without changing the rest of the timeline surface.

**Tech Stack:** TypeScript, Fastify, React, Vitest

---

### Task 1: Add Red Tests For Timeline Child Runs

**Files:**
- Modify: `apps/control-plane/test/admin-runs-route.test.ts`
- Modify: `apps/web/src/components/admin/RunTimelinePage.test.tsx`

**Step 1: Write the failing admin timeline route test**

Assert that `GET /admin/runs/:runId/timeline` includes a `childRuns` array containing direct child runs for the parent.

**Step 2: Write the failing RunTimelinePage render test**

Assert that the page renders a `Subagents` section and shows each child run id, profile id, and status.

**Step 3: Run targeted tests to verify failure**

Run:

```bash
pnpm test -- apps/control-plane/test/admin-runs-route.test.ts apps/web/src/components/admin/RunTimelinePage.test.tsx
```

### Task 2: Expose Child Runs From The Timeline Route

**Files:**
- Modify: `apps/control-plane/src/routes/admin-runs.ts`
- Modify: `apps/control-plane/test/admin-runs-route.test.ts`

**Step 1: Query child runs by parentRunId**

When loading a timeline, also load `services.store.runs.listRuns({ parentRunId: runId })`.

**Step 2: Return child runs in the response**

Add a `childRuns` field to the timeline response without changing the existing `run/events/checkpoints/memoryEntries` payloads.

### Task 3: Render Subagents In RunTimelinePage

**Files:**
- Modify: `apps/web/src/components/admin/RunTimelinePage.tsx`
- Modify: `apps/web/src/components/admin/RunTimelinePage.test.tsx`

**Step 1: Extend the component props**

Add `childRuns: Run[]` to the timeline page props.

**Step 2: Render a dedicated subagent section**

Show each child run with:
- run id
- profile id
- status

### Task 4: Verify

**Step 1: Run targeted verification**

Run:

```bash
pnpm test -- apps/control-plane/test/admin-runs-route.test.ts apps/web/src/components/admin/RunTimelinePage.test.tsx
```

**Step 2: Run broader verification**

Run:

```bash
pnpm test -- apps/control-plane/test/admin-runs-route.test.ts apps/web/src/components/admin/RunTimelinePage.test.tsx tests/workspace/architecture-budgets.test.ts
pnpm verify:architecture
```
