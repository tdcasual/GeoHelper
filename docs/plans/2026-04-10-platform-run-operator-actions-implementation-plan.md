# Platform Run Operator Actions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn the current platform run console from inspection-only into an operator action surface where pending checkpoints can be approved, live runs can be cancelled, and stale delegation claims can be force-released from the web UI.

**Architecture:** Reuse the current `control-plane + worker + web` runtime and the freshly-landed run observability surface. Do not redesign the workspace shell or reopen runtime compatibility work. Reuse the existing checkpoint resolve and run cancel routes where they already fit, add one narrow admin delegation-release mutation for operator recovery, then wire the current run console and admin inspector to execute those actions and refresh the existing run/checkpoint/artifact/delegation stores from fresh control-plane snapshots.

**Tech Stack:** TypeScript, React, Zustand, Fastify, Vitest, Playwright, existing GeoHelper control-plane/web runtime packages

---

## Finish Definition

This phase is complete only when all of the following are true:

1. Operators can approve a pending checkpoint from the workspace run console and the latest-run cards refresh without a manual reload.
2. Operators can cancel a non-terminal run from the same surface and the latest run status plus timeline reflect the cancellation.
3. Operators can force-release a stale pending delegation claim from the operator inspector even when the original executor is unavailable.
4. Post-action refresh reuses the existing run/checkpoint/artifact/delegation stores instead of creating a second parallel runtime state path.
5. Plan index status clearly marks the new operator-action plan as the active execution track and the run observability phase as the delivered baseline on `main`.

Anything outside that boundary is deferred.

## Scope Freeze Rules

During this phase, do not start new work in these areas:

1. New workflow-node kinds, checkpoint semantics, or deeper worker/control-plane runtime behavior.
2. Generic freeform checkpoint-response editors or schema-specific operator forms beyond the explicit approval action needed for this phase.
3. New standalone admin applications, router migrations, or layout redesigns outside the existing left-canvas / right-dialog workspace shell.
4. Shared-staging live validation work that depends on unavailable operator credentials.

## Task 1: Add The Missing Operator Delegation Recovery Route

**Files:**
- Modify: `apps/control-plane/src/routes/delegation-sessions.ts`
- Modify: `apps/control-plane/test/delegation-sessions-route.test.ts`

**Step 1: Write the failing route tests**

Extend the delegation session route tests so they assert:

- `POST /admin/delegation-sessions/:sessionId/release` force-releases a pending claimed session without requiring `executorId === claimedBy`
- the route clears `claimedBy`, `claimedAt`, and `claimExpiresAt`
- the route returns `404` for a missing session
- the route returns `409` when the session is no longer `pending`

**Step 2: Run the failing tests**

Run:

```bash
pnpm --filter @geohelper/control-plane test -- test/delegation-sessions-route.test.ts
```

Expected: FAIL because the current delegation release route is executor-owned only and there is no operator/admin release path.

**Step 3: Implement the minimal admin recovery route**

Update `delegation-sessions.ts` so it:

- adds a narrow admin/operator release route for pending sessions
- reuses the existing session hydration path so the response shape stays consistent with the rest of the delegation API
- does not add new persistence tables or change executor-claim semantics for the existing `/api/v3/.../release` route

**Step 4: Re-run the route tests**

Run:

```bash
pnpm --filter @geohelper/control-plane test -- test/delegation-sessions-route.test.ts
```

Expected: PASS.

**Step 5: Commit**

Run:

```bash
git add apps/control-plane/src/routes/delegation-sessions.ts apps/control-plane/test/delegation-sessions-route.test.ts
git commit -m "feat: add operator delegation release route"
```

## Task 2: Extend The Web Client And Shared Run Refresh Plumbing

**Files:**
- Modify: `apps/web/src/runtime/control-plane-client.ts`
- Modify: `apps/web/src/runtime/control-plane-client.test.ts`
- Create: `apps/web/src/state/platform-run-recorder.ts`
- Create: `apps/web/src/state/platform-run-recorder.test.ts`
- Modify: `apps/web/src/state/chat-store.ts`

**Step 1: Write the failing client/state tests**

Cover:

- `control-plane-client` can cancel a run through `POST /api/v3/runs/:runId/cancel`
- `control-plane-client` can force-release a delegation session through `POST /admin/delegation-sessions/:sessionId/release`
- a shared `platform-run-recorder` helper applies a fresh run snapshot plus delegation sessions to `runStore`, `checkpointStore`, `artifactStore`, and `delegationSessionStore`
- `chat-store` reuses the shared recorder helper instead of duplicating that fan-out logic inline

**Step 2: Run the failing tests**

Run:

```bash
pnpm test -- apps/web/src/runtime/control-plane-client.test.ts apps/web/src/state/platform-run-recorder.test.ts
```

Expected: FAIL because the client lacks the operator mutation helpers and there is no reusable run-recorder helper yet.

**Step 3: Implement the minimal data-layer additions**

Add:

- `cancelRun(runId)`
- `forceReleaseDelegationSession(sessionId)`
- a shared run-recorder helper that fans a fresh `RunSnapshot` and delegation sessions into the existing runtime stores

Keep:

- the existing `resolveCheckpoint()` client method
- the existing store shapes wherever possible
- the current stream/snapshot-driven runtime model

**Step 4: Re-run focused verification**

Run:

```bash
pnpm test -- apps/web/src/runtime/control-plane-client.test.ts apps/web/src/state/platform-run-recorder.test.ts
pnpm exec tsc -p apps/web/tsconfig.json --noEmit
```

Expected: PASS.

**Step 5: Commit**

Run:

```bash
git add apps/web/src/runtime/control-plane-client.ts apps/web/src/runtime/control-plane-client.test.ts apps/web/src/state/platform-run-recorder.ts apps/web/src/state/platform-run-recorder.test.ts apps/web/src/state/chat-store.ts
git commit -m "feat: add platform run operator action helpers"
```

## Task 3: Wire Operator Actions Into The Existing Run Console And Inspector

**Files:**
- Modify: `apps/web/src/components/RunConsole.tsx`
- Modify: `apps/web/src/components/RunConsole.test.ts`
- Modify: `apps/web/src/components/CheckpointInbox.tsx`
- Modify: `apps/web/src/components/DelegationSessionInbox.tsx`
- Modify: `apps/web/src/components/admin/RunTimelinePage.tsx`
- Modify: `apps/web/src/components/admin/RunTimelinePage.test.ts`
- Modify: `apps/web/src/components/admin/AdminRunInspector.tsx`
- Modify: `apps/web/src/components/admin/AdminRunInspector.test.tsx`
- Modify: `apps/web/src/styles/workspace-shell.css`

**Step 1: Write the failing UI tests**

Cover:

- the latest-run checkpoint card renders an explicit approval action for pending checkpoints
- the latest-run console renders a cancel action when the run is not terminal
- the inspector timeline renders a release action for pending claimed delegation sessions
- action pending/error state is readable from the existing run console surface instead of silently failing

**Step 2: Run the failing tests**

Run:

```bash
pnpm test -- apps/web/src/components/RunConsole.test.ts apps/web/src/components/admin/RunTimelinePage.test.ts apps/web/src/components/admin/AdminRunInspector.test.tsx
```

Expected: FAIL because the current run console and inspector are read-only.

**Step 3: Implement the minimal operator action surface**

Update the current UI so it:

- wires checkpoint approval to `resolveCheckpoint(checkpointId, { approved: true })`
- wires run cancellation to `cancelRun(runId)`
- wires delegation claim release to `forceReleaseDelegationSession(sessionId)`
- refreshes the current latest-run stores through the shared recorder helper after each successful mutation
- refreshes the selected admin timeline after each successful mutation so inspector details stay in sync

Do not:

- introduce a generic JSON editor for arbitrary checkpoint payloads
- add a second competing admin shell
- move the workspace away from the current left-canvas / right-dialog contract

**Step 4: Re-run focused frontend verification**

Run:

```bash
pnpm test -- apps/web/src/components/RunConsole.test.ts apps/web/src/components/admin/RunTimelinePage.test.ts apps/web/src/components/admin/AdminRunInspector.test.tsx
pnpm exec eslint apps/web/src/components apps/web/src/styles
```

Expected: PASS.

**Step 5: Commit**

Run:

```bash
git add apps/web/src/components/RunConsole.tsx apps/web/src/components/RunConsole.test.ts apps/web/src/components/CheckpointInbox.tsx apps/web/src/components/DelegationSessionInbox.tsx apps/web/src/components/admin/RunTimelinePage.tsx apps/web/src/components/admin/RunTimelinePage.test.ts apps/web/src/components/admin/AdminRunInspector.tsx apps/web/src/components/admin/AdminRunInspector.test.tsx apps/web/src/styles/workspace-shell.css
git commit -m "feat: add platform run operator actions"
```

## Task 4: Add End-To-End Coverage For The Operator Action Loop

**Files:**
- Modify: `tests/e2e/platform-run-console.spec.ts`

**Step 1: Write the failing E2E assertions**

Cover:

- approving a pending checkpoint posts the resolve mutation and removes the item from the checkpoint inbox after refresh
- force-releasing a claimed delegation session updates the inspector so claim metadata disappears
- cancelling the latest run updates the run status to `cancelled` while the desktop shell layout remains stable

**Step 2: Run the failing E2E slice**

Run:

```bash
pnpm test:e2e -- tests/e2e/platform-run-console.spec.ts
```

Expected: FAIL because the current E2E only verifies read-only run inspection.

**Step 3: Implement the minimal E2E fixture updates**

Update the test fixture so it:

- stubs the new operator mutation endpoints
- returns fresh post-mutation stream/timeline payloads
- asserts that the right-rail operator surface remains usable after each action

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
git commit -m "test: cover platform run operator actions"
```

## Task 5: Final Verification And Plan Index Sync

**Files:**
- Modify: `docs/plans/README.md`

**Step 1: Run focused cross-stack verification**

Run:

```bash
pnpm --filter @geohelper/control-plane test -- test/checkpoints-route.test.ts test/run-cancel-route.test.ts test/delegation-sessions-route.test.ts test/admin-runs-route.test.ts
pnpm test -- apps/web/src/runtime/control-plane-client.test.ts apps/web/src/state/platform-run-recorder.test.ts apps/web/src/components/RunConsole.test.ts apps/web/src/components/admin/RunTimelinePage.test.ts apps/web/src/components/admin/AdminRunInspector.test.tsx
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

- adds this plan to the current active execution track
- marks the 2026-04-09 run observability plan as the delivered baseline on `main`
- keeps the shared-staging credential blocker note in place instead of implying external live sign-off is complete

**Step 4: Commit**

Run:

```bash
git add docs/plans/README.md docs/plans/2026-04-10-platform-run-operator-actions-implementation-plan.md
git commit -m "docs: add platform run operator actions plan"
```
