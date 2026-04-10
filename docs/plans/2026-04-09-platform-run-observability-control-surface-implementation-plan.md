# Platform Run Observability Control Surface Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn the current platform-agent baseline from "runtime-complete but operator-thin" into a usable run observability and control surface where operators can list runs, inspect timelines, review artifacts and memory writes, and navigate parent/child execution from the web UI without dropping to raw JSON.

**Architecture:** Keep the existing `control-plane + worker + web` runtime and current portable-bundle contract intact. This phase is not another runtime rewrite. Instead, promote the already-existing admin routes and run console into a first-class operator surface: enrich the control-plane timeline contract, add web client/state support for admin run inspection, and upgrade the current workspace run console into a detailed inspector that can traverse parent runs, child runs, checkpoints, delegation sessions, artifacts, and memory writes. Do not reopen legacy compatibility work or redesign the workspace shell from scratch.

**Tech Stack:** TypeScript, React, Zustand, Fastify, Vitest, existing GeoHelper control-plane/web runtime packages

---

## Finish Definition

This phase is complete only when all of the following are true:

1. Operators can load a run list and a full run timeline through the web client instead of stitching together multiple raw control-plane responses manually.
2. The control-plane admin timeline response exposes artifacts and compact operator summaries in addition to raw events/checkpoints/delegation sessions.
3. The web UI can inspect the latest run and navigate to child runs from the existing workspace run console without collapsing the left-canvas / right-dialog shell contract.
4. Timeline details make checkpoints, delegation sessions, memory writes, and artifacts readable enough for release/debug work, not just test snapshots.
5. Plan index status clearly reflects that release-candidate implementation is complete in-repo and that shared-staging sign-off remains blocked by missing credentials rather than missing code.

Anything outside that boundary is deferred.

## Scope Freeze Rules

During this phase, do not start new work in these areas:

1. New workflow-node kinds or deeper worker/control-plane runtime semantics.
2. New bundle/export compatibility layers beyond the current OpenClaw-portable contract.
3. New layout redesigns unrelated to operator observability and run inspection.
4. Release-environment automation that depends on unavailable shared-staging credentials.

## Task 1: Enrich The Control-Plane Admin Run Timeline Contract

**Files:**
- Modify: `apps/control-plane/src/routes/admin-runs.ts`
- Modify: `apps/control-plane/test/admin-runs-route.test.ts`

**Step 1: Write the failing route tests**

Extend the admin route tests so they assert:

- `GET /admin/runs/:runId/timeline` returns the run artifacts alongside the existing events/checkpoints/delegation sessions/memory entries
- the response exposes a compact `summary` object with at least `eventCount`, `checkpointCount`, `pendingCheckpointCount`, `delegationSessionCount`, `pendingDelegationCount`, `artifactCount`, `memoryWriteCount`, and `childRunCount`
- the route still supports missing-run `404` behavior

**Step 2: Run the failing tests**

Run:

```bash
pnpm --filter @geohelper/control-plane test -- test/admin-runs-route.test.ts
```

Expected: FAIL because the current timeline route only returns raw run/event/checkpoint/delegation/memory arrays and does not surface artifacts or a compact operator summary.

**Step 3: Implement the minimal timeline enrichment**

Update the route so it:

- resolves artifacts referenced by the parent run and child runs into a dedicated `artifacts` array
- computes a compact `summary` object suitable for operator UI rendering
- keeps the existing raw arrays untouched so downstream inspection is still possible

Do not add new persistence tables in this task.

**Step 4: Re-run the route tests**

Run:

```bash
pnpm --filter @geohelper/control-plane test -- test/admin-runs-route.test.ts
```

Expected: PASS.

**Step 5: Commit**

Run:

```bash
git add apps/control-plane/src/routes/admin-runs.ts apps/control-plane/test/admin-runs-route.test.ts
git commit -m "feat: enrich admin run timeline contract"
```

## Task 2: Add Web Client And State Support For Admin Run Inspection

**Files:**
- Modify: `apps/web/src/runtime/types.ts`
- Modify: `apps/web/src/runtime/control-plane-client.ts`
- Modify: `apps/web/src/runtime/control-plane-client.test.ts`
- Create: `apps/web/src/state/admin-run-store.ts`
- Create: `apps/web/src/state/admin-run-store.test.ts`

**Step 1: Write the failing client/store tests**

Cover:

- the control-plane client can list admin runs with status/parent filters
- the control-plane client can load one admin run timeline payload with `summary` and `artifacts`
- a dedicated admin run store can cache run lists, cache timelines by run id, and keep `selectedRunId`, loading state, and request errors

**Step 2: Run the failing web tests**

Run:

```bash
pnpm test -- apps/web/src/runtime/control-plane-client.test.ts apps/web/src/state/admin-run-store.test.ts
```

Expected: FAIL because the current web client only exposes end-user runtime methods (`thread`, `run`, `stream`, `checkpoint`, `delegation`) and no admin run inspection state exists.

**Step 3: Implement the minimal admin inspection data layer**

Add:

- runtime types for `AdminRunTimelineSummary` and `AdminRunTimeline`
- client methods such as `listAdminRuns()` and `getAdminRunTimeline()`
- a lightweight Zustand-backed admin run store for list/timeline loading and selection state

Keep:

- the existing workspace run stores as-is
- the admin run store read-only in this phase

**Step 4: Re-run focused verification**

Run:

```bash
pnpm test -- apps/web/src/runtime/control-plane-client.test.ts apps/web/src/state/admin-run-store.test.ts
pnpm exec tsc -p apps/web/tsconfig.json --noEmit
```

Expected: PASS.

**Step 5: Commit**

Run:

```bash
git add apps/web/src/runtime/types.ts apps/web/src/runtime/control-plane-client.ts apps/web/src/runtime/control-plane-client.test.ts apps/web/src/state/admin-run-store.ts apps/web/src/state/admin-run-store.test.ts
git commit -m "feat: add admin run inspection client state"
```

## Task 3: Turn RunTimelinePage Into A Real Operator Inspector

**Files:**
- Modify: `apps/web/src/components/admin/RunTimelinePage.tsx`
- Modify: `apps/web/src/components/admin/RunTimelinePage.test.ts`
- Create: `apps/web/src/components/admin/AdminRunInspector.tsx`
- Create: `apps/web/src/components/admin/AdminRunInspector.test.tsx`

**Step 1: Write the failing UI tests**

Cover:

- the inspector renders run summary counts, artifact inventory, pending checkpoint details, delegation claim metadata, and memory writes
- operators can select a run from a list and load its timeline into the detail panel
- child runs are rendered as navigable items rather than plain text only

**Step 2: Run the failing tests**

Run:

```bash
pnpm test -- apps/web/src/components/admin/RunTimelinePage.test.ts apps/web/src/components/admin/AdminRunInspector.test.tsx
```

Expected: FAIL because `RunTimelinePage` is currently a static render-only component and there is no list/detail admin inspector container.

**Step 3: Implement the minimal operator inspector**

Build:

- a list/detail admin inspector container component
- richer timeline presentation for events, checkpoints, delegation sessions, artifacts, and memory writes
- compact summary cards that reflect the timeline `summary` contract instead of forcing operators to derive counts mentally

Do not add a router dependency or a separate full admin app in this task.

**Step 4: Re-run focused frontend verification**

Run:

```bash
pnpm test -- apps/web/src/components/admin/RunTimelinePage.test.ts apps/web/src/components/admin/AdminRunInspector.test.tsx
pnpm exec eslint apps/web/src/components/admin
```

Expected: PASS.

**Step 5: Commit**

Run:

```bash
git add apps/web/src/components/admin/RunTimelinePage.tsx apps/web/src/components/admin/RunTimelinePage.test.ts apps/web/src/components/admin/AdminRunInspector.tsx apps/web/src/components/admin/AdminRunInspector.test.tsx
git commit -m "feat: add admin run inspector surface"
```

## Task 4: Wire The Inspector Into The Existing Workspace Run Console

**Files:**
- Modify: `apps/web/src/components/RunConsole.tsx`
- Modify: `apps/web/src/components/RunConsole.test.ts`
- Modify: `apps/web/src/components/WorkspaceShell.tsx`
- Modify: `apps/web/src/styles/workspace-shell.css`
- Test: `tests/e2e/platform-run-console.spec.ts`

**Step 1: Write the failing console/E2E assertions**

Cover:

- the workspace run console can open the operator inspector for the latest run
- operators can navigate from the latest run to a child run timeline without breaking the stable left-canvas / right-dialog desktop shell
- inspector content remains reachable after history open/close and while checkpoints/delegation sessions are visible

**Step 2: Run the failing verification slice**

Run:

```bash
pnpm test -- apps/web/src/components/RunConsole.test.ts
pnpm test:e2e -- tests/e2e/platform-run-console.spec.ts
```

Expected: FAIL because the current run console only shows shallow cards/lists and does not host a detailed inspector flow.

**Step 3: Implement the minimal workspace integration**

Update:

- `RunConsole` to host the richer inspector entrypoint and selected-run detail rendering
- `WorkspaceShell` to pass through the state needed for the latest-run inspector without changing the main left-canvas / right-dialog contract
- styles so the console remains readable in the converged desktop shell

Do not:

- move the main workspace shell away from the current layout
- create a second competing desktop panel architecture

**Step 4: Re-run focused verification**

Run:

```bash
pnpm test -- apps/web/src/components/RunConsole.test.ts apps/web/src/components/admin/RunTimelinePage.test.ts apps/web/src/components/admin/AdminRunInspector.test.tsx
pnpm test:e2e -- tests/e2e/platform-run-console.spec.ts
pnpm exec tsc -p apps/web/tsconfig.json --noEmit
```

Expected: PASS.

**Step 5: Commit**

Run:

```bash
git add apps/web/src/components/RunConsole.tsx apps/web/src/components/RunConsole.test.ts apps/web/src/components/WorkspaceShell.tsx apps/web/src/styles/workspace-shell.css tests/e2e/platform-run-console.spec.ts
git commit -m "feat: wire admin run inspection into run console"
```

## Task 5: Final Verification And Plan Index Status Sync

**Files:**
- Modify: `docs/plans/README.md`

**Step 1: Run focused cross-stack verification**

Run:

```bash
pnpm --filter @geohelper/control-plane test -- test/admin-runs-route.test.ts
pnpm test -- apps/web/src/runtime/control-plane-client.test.ts apps/web/src/state/admin-run-store.test.ts apps/web/src/components/admin/RunTimelinePage.test.ts apps/web/src/components/admin/AdminRunInspector.test.tsx apps/web/src/components/RunConsole.test.ts
pnpm test:e2e -- tests/e2e/platform-run-console.spec.ts
pnpm typecheck
```

**Step 2: Run lint**

Run:

```bash
pnpm exec eslint apps/control-plane/src/routes apps/control-plane/test apps/web/src/runtime apps/web/src/state apps/web/src/components apps/web/src/styles tests/e2e
```

Expected: PASS.

**Step 3: Update the plan index**

Update `docs/plans/README.md` so it:

- adds this plan under the current active execution track
- marks post-cutover closure as completed on the current branch
- marks release-candidate live validation implementation as complete in-repo while shared-staging sign-off remains blocked by missing credentials recorded in `docs/BETA_CHECKLIST.md`

**Step 4: Commit**

Run:

```bash
git add docs/plans/README.md docs/plans/2026-04-09-platform-run-observability-control-surface-implementation-plan.md
git commit -m "docs: add platform run observability plan"
```
