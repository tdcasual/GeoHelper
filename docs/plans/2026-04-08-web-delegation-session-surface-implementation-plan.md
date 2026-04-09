# Web Delegation Session Surface Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the Web/runtime layer understand and display external delegation sessions instead of collapsing them into generic pending checkpoints.

**Architecture:** Reuse the new control-plane delegation session routes as the source of truth. The web runtime client will fetch delegation sessions alongside run snapshots, the chat/runtime stores will persist them in a lightweight delegation session store, and Run Console plus admin timeline surfaces will render external-delegation-specific status and metadata. This keeps the current snapshot-driven UI model intact while exposing the platform-agent external delegation layer to operators and users.

**Tech Stack:** TypeScript, React, Zustand, Fastify, Vitest, existing GeoHelper web/control-plane/runtime packages

---

## Task 1: Propagate delegation session data through runtime client types

**Files:**
- Modify: `packages/agent-store/src/index.ts`
- Modify: `apps/web/src/runtime/types.ts`
- Modify: `apps/web/src/runtime/control-plane-client.ts`
- Modify: `apps/web/src/runtime/platform-runner.ts`
- Test: `apps/web/src/runtime/control-plane-client.test.ts`

**Step 1: Write the failing test**

Cover:
- `control-plane-client` can list delegation sessions for a run
- `platform-runner` includes delegation sessions in `RuntimeRunResponse`

**Step 2: Run the failing test**

Run: `pnpm --filter @geohelper/web test -- src/runtime/control-plane-client.test.ts`

Expected: FAIL because delegation sessions are not part of the web runtime contract yet.

**Step 3: Implement minimal client support**

Add:
- exported delegation session types from `@geohelper/agent-store`
- `listDelegationSessions({ runId, status })`
- `RuntimeRunResponse.delegationSessions`
- `submitPromptToPlatform()` fetching delegation sessions after the run snapshot

**Step 4: Re-run the test**

Run: `pnpm --filter @geohelper/web test -- src/runtime/control-plane-client.test.ts`

Expected: PASS

## Task 2: Add a lightweight delegation session store and wire chat/runtime recording

**Files:**
- Create: `apps/web/src/state/delegation-session-store.ts`
- Modify: `apps/web/src/state/chat-store.ts`
- Modify: `apps/web/src/state/chat-store-actions.ts`
- Test: `apps/web/src/state/chat-store-actions.test.ts`

**Step 1: Write the failing test**

Cover:
- recording a run response also records delegation sessions for the run

**Step 2: Run the failing test**

Run: `pnpm --filter @geohelper/web test -- src/state/chat-store-actions.test.ts`

Expected: FAIL because delegation sessions are discarded today.

**Step 3: Implement the store wiring**

Add:
- delegation session Zustand store keyed by run id and session id
- `recordRunSnapshot` input extended with delegation sessions
- default chat-store recording path applying delegation sessions after compile

**Step 4: Re-run the test**

Run: `pnpm --filter @geohelper/web test -- src/state/chat-store-actions.test.ts`

Expected: PASS

## Task 3: Surface delegation sessions in Run Console and admin timeline

**Files:**
- Create: `apps/web/src/components/DelegationSessionInbox.tsx`
- Modify: `apps/web/src/components/RunConsole.tsx`
- Modify: `apps/web/src/components/RunConsole.test.ts`
- Modify: `apps/web/src/components/WorkspaceShell.tsx`
- Modify: `apps/web/src/components/workspace-shell/platform-run-selectors.ts`
- Modify: `apps/web/src/components/admin/RunTimelinePage.tsx`
- Modify: `apps/web/src/components/admin/RunTimelinePage.test.ts`
- Modify: `apps/control-plane/src/routes/admin-runs.ts`
- Modify: `apps/control-plane/test/admin-runs-route.test.ts`

**Step 1: Write the failing tests**

Cover:
- Run Console displays pending delegation sessions distinctly from generic checkpoints
- admin timeline includes delegation session metadata for a run

**Step 2: Run the failing tests**

Run:
- `pnpm --filter @geohelper/web test -- src/components/RunConsole.test.ts src/components/admin/RunTimelinePage.test.ts`
- `pnpm --filter @geohelper/control-plane test -- test/admin-runs-route.test.ts`

Expected: FAIL because no delegation session surface exists yet.

**Step 3: Implement the minimal UI**

Add:
- delegation session card in Run Console
- selector wiring from delegation session store
- admin timeline payload + rendering for delegation sessions

**Step 4: Re-run the tests**

Run:
- `pnpm --filter @geohelper/web test -- src/components/RunConsole.test.ts src/components/admin/RunTimelinePage.test.ts`
- `pnpm --filter @geohelper/control-plane test -- test/admin-runs-route.test.ts`

Expected: PASS

## Task 4: Verification pass

**Files:**
- Modify: `docs/plans/README.md`

**Step 1: Run focused verification**

Run:
- `pnpm --filter @geohelper/web test`
- `pnpm --filter @geohelper/control-plane test`

**Step 2: Run cross-repo verification**

Run:
- `pnpm typecheck`
- `pnpm exec eslint apps/web apps/control-plane packages/agent-store`

**Step 3: Update plan index**

Add this plan to `docs/plans/README.md`.
