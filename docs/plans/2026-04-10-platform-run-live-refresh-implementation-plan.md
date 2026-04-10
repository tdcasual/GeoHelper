# Platform Run Live Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep the platform run console and admin inspector live while runs are still changing, so operators no longer depend on action-triggered refreshes or manual reopen cycles to see current status.

**Architecture:** Reuse the existing `streamRun(runId, { afterSequence })`, admin timeline route, and shared `recordPlatformRunSnapshot()` fan-out path. Add a small web-side live-sync layer that polls the latest run snapshot and selected admin timeline with cursors and stop conditions, then wire the current right-rail run console to surface sync status, retry state, and fresh data without redesigning the workspace shell.

**Tech Stack:** TypeScript, React, Zustand, Vitest, Playwright, existing GeoHelper control-plane/web runtime packages

---

## Finish Definition

This phase is complete only when all of the following are true:

1. The latest run console keeps refreshing the current run while it remains non-terminal, and stops automatically once the run reaches a terminal state.
2. The selected admin inspector timeline keeps refreshing while it is still operationally relevant, including child runs that remain live or still hold pending claimed delegation sessions.
3. Background refresh reuses the existing run snapshot recorder and admin timeline store paths instead of introducing another parallel cache tree in components.
4. Operators can see whether live refresh is active, retrying, or errored from the existing run console surface without losing access to operator actions.
5. The end-to-end run-console test covers at least one background refresh transition in addition to the explicit operator action loop.

Anything outside that boundary is deferred.

## Scope Freeze Rules

During this phase, do not start new work in these areas:

1. New control-plane persistence tables, websocket transports, or long-lived backend subscriptions.
2. Generic checkpoint response editors, retry-run mutations, or new operator mutation semantics beyond the already shipped approve / cancel / release actions.
3. Layout redesigns outside the existing left-canvas / right-dialog workspace shell.
4. Cross-run dashboards, search, or a separate admin application shell.

## Task 1: Add A Reusable Latest-Run Live Sync Controller

**Files:**
- Create: `apps/web/src/state/platform-run-live-sync.ts`
- Create: `apps/web/src/state/platform-run-live-sync.test.ts`
- Modify: `apps/web/src/state/platform-run-recorder.ts`

**Step 1: Write the failing controller tests**

Cover:

- a live-sync controller polls `streamRun(runId, { afterSequence })` and `listDelegationSessions({ runId })`
- each successful refresh records the new snapshot through the shared `recordPlatformRunSnapshot()` path
- the controller advances its sequence cursor after new events arrive
- the controller stops polling once the run status becomes terminal
- the controller exposes readable sync state such as `idle`, `syncing`, `retrying`, and `error`

**Step 2: Run the failing tests**

Run:

```bash
pnpm test -- apps/web/src/state/platform-run-live-sync.test.ts
```

Expected: FAIL because there is no reusable live-sync controller yet.

**Step 3: Implement the minimal live-sync controller**

Add:

- a small polling controller that owns `afterSequence`, retry delay, and stop conditions
- a callback or store-safe API that reports live-sync state changes to the UI
- shared recorder integration through `recordPlatformRunSnapshot()`

Keep:

- the current `ControlPlaneClient` surface
- the existing run/checkpoint/artifact/delegation stores
- the current snapshot-driven runtime model

**Step 4: Re-run focused verification**

Run:

```bash
pnpm test -- apps/web/src/state/platform-run-live-sync.test.ts
pnpm exec tsc -p apps/web/tsconfig.json --noEmit
```

Expected: PASS.

**Step 5: Commit**

Run:

```bash
git add apps/web/src/state/platform-run-live-sync.ts apps/web/src/state/platform-run-live-sync.test.ts apps/web/src/state/platform-run-recorder.ts
git commit -m "feat: add platform run live sync controller"
```

## Task 2: Extend Admin Timeline Refresh Plumbing

**Files:**
- Modify: `apps/web/src/state/admin-run-store.ts`
- Modify: `apps/web/src/state/admin-run-store.test.ts`
- Create: `apps/web/src/state/admin-run-live-sync.ts`
- Create: `apps/web/src/state/admin-run-live-sync.test.ts`

**Step 1: Write the failing admin refresh tests**

Cover:

- `admin-run-store` can refresh an already cached timeline without dropping selection state
- a dedicated admin live-sync controller can keep refreshing one selected run timeline
- the selected run stops polling when the timeline run becomes terminal and has no pending claimed delegation session left to watch
- refresh failures keep the last successful timeline while exposing readable error state

**Step 2: Run the failing tests**

Run:

```bash
pnpm test -- apps/web/src/state/admin-run-store.test.ts apps/web/src/state/admin-run-live-sync.test.ts
```

Expected: FAIL because timeline refresh metadata and a selected-run live-sync controller do not exist yet.

**Step 3: Implement the minimal admin refresh layer**

Add:

- refresh-aware store methods for replacing cached timeline data
- a small selected-run polling controller for inspector use
- per-run loading / retry / error metadata that does not blow away existing timeline content

Do not:

- add a second timeline cache tree inside components
- add new backend routes
- reload the entire admin run list on every selected-run refresh tick

**Step 4: Re-run focused verification**

Run:

```bash
pnpm test -- apps/web/src/state/admin-run-store.test.ts apps/web/src/state/admin-run-live-sync.test.ts
pnpm exec tsc -p apps/web/tsconfig.json --noEmit
```

Expected: PASS.

**Step 5: Commit**

Run:

```bash
git add apps/web/src/state/admin-run-store.ts apps/web/src/state/admin-run-store.test.ts apps/web/src/state/admin-run-live-sync.ts apps/web/src/state/admin-run-live-sync.test.ts
git commit -m "feat: add admin timeline live refresh"
```

## Task 3: Wire Live Refresh Into RunConsole And Inspector UI

**Files:**
- Modify: `apps/web/src/components/RunConsole.tsx`
- Modify: `apps/web/src/components/RunConsole.test.ts`
- Modify: `apps/web/src/components/admin/AdminRunInspector.tsx`
- Modify: `apps/web/src/components/admin/AdminRunInspector.test.tsx`
- Modify: `apps/web/src/components/admin/RunTimelinePage.tsx`
- Modify: `apps/web/src/components/admin/RunTimelinePage.test.ts`
- Modify: `apps/web/src/styles/workspace-shell.css`

**Step 1: Write the failing UI tests**

Cover:

- the latest run console renders a live refresh indicator while the run is still active
- the inspector keeps its selected run panel visible while background refresh state changes
- refresh errors are readable from the existing run console / inspector surface
- operator action buttons remain usable while live refresh is active

**Step 2: Run the failing tests**

Run:

```bash
pnpm test -- apps/web/src/components/RunConsole.test.ts apps/web/src/components/admin/RunTimelinePage.test.ts apps/web/src/components/admin/AdminRunInspector.test.tsx
```

Expected: FAIL because the current UI only refreshes after explicit operator mutations.

**Step 3: Implement the minimal UI wiring**

Update the current UI so it:

- starts latest-run live sync when the displayed run is still active
- starts selected-timeline live sync when the inspector is open on a relevant run
- surfaces `syncing`, `retrying`, and `error` state inline
- shuts polling down when the console unmounts or the selected run changes

Do not:

- introduce a separate "live monitor" panel
- redesign the workspace shell
- add generic toast infrastructure just for this phase

**Step 4: Re-run focused frontend verification**

Run:

```bash
pnpm test -- apps/web/src/components/RunConsole.test.ts apps/web/src/components/admin/RunTimelinePage.test.ts apps/web/src/components/admin/AdminRunInspector.test.tsx
pnpm exec eslint apps/web/src/components apps/web/src/styles apps/web/src/state
```

Expected: PASS.

**Step 5: Commit**

Run:

```bash
git add apps/web/src/components/RunConsole.tsx apps/web/src/components/RunConsole.test.ts apps/web/src/components/admin/AdminRunInspector.tsx apps/web/src/components/admin/AdminRunInspector.test.tsx apps/web/src/components/admin/RunTimelinePage.tsx apps/web/src/components/admin/RunTimelinePage.test.ts apps/web/src/styles/workspace-shell.css
git commit -m "feat: wire live platform run refresh into console"
```

## Task 4: Extend End-To-End Coverage For Background Refresh

**Files:**
- Modify: `tests/e2e/platform-run-console.spec.ts`

**Step 1: Write the failing E2E assertions**

Cover:

- the latest run console updates from a later streamed snapshot without reloading the page
- the inspector selected child run timeline refreshes and drops stale claim metadata once the backend state changes
- the right-rail operator surface remains stable while live refresh and explicit operator actions both occur

**Step 2: Run the failing E2E slice**

Run:

```bash
pnpm test:e2e -- tests/e2e/platform-run-console.spec.ts
```

Expected: FAIL because the current E2E only verifies mutation-triggered refreshes.

**Step 3: Implement the minimal E2E fixture upgrades**

Update the test fixture so it:

- returns evolving `streamRun(...afterSequence)` payloads
- returns refreshed admin timeline payloads for selected child runs
- asserts that live refresh indicators and current content remain visible during the loop

**Step 4: Re-run the E2E verification**

Run:

```bash
pnpm test:e2e -- tests/e2e/platform-run-console.spec.ts
```

Expected: PASS.

**Step 5: Commit**

Run:

```bash
git add tests/e2e/platform-run-console.spec.ts
git commit -m "test: cover platform run live refresh"
```

## Task 5: Final Verification And Plan Index Sync

**Files:**
- Modify: `docs/plans/README.md`

**Step 1: Run focused cross-stack verification**

Run:

```bash
pnpm test -- apps/web/src/state/platform-run-live-sync.test.ts apps/web/src/state/admin-run-store.test.ts apps/web/src/state/admin-run-live-sync.test.ts apps/web/src/components/RunConsole.test.ts apps/web/src/components/admin/RunTimelinePage.test.ts apps/web/src/components/admin/AdminRunInspector.test.tsx
pnpm test:e2e -- tests/e2e/platform-run-console.spec.ts
pnpm typecheck
```

Expected: PASS.

**Step 2: Run lint**

Run:

```bash
pnpm exec eslint apps/web/src/runtime apps/web/src/state apps/web/src/components apps/web/src/styles tests/e2e
```

Expected: PASS.

**Step 3: Update the plan index**

Update `docs/plans/README.md` so it:

- adds this plan to the current active execution track
- marks the 2026-04-10 operator-action plan as the delivered baseline on `main`
- preserves the shared-staging credential blocker note instead of implying live production sign-off is complete

**Step 4: Commit**

Run:

```bash
git add docs/plans/README.md docs/plans/2026-04-10-platform-run-live-refresh-implementation-plan.md
git commit -m "docs: add platform run live refresh plan"
```
