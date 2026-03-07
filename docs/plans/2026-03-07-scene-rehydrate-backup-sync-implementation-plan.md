# Scene Rehydrate And Backup Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix GeoGebra live runtime state restore so persisted scene snapshots replay only after the applet is actually ready, and make backup import update the currently running stores and canvas immediately.

**Architecture:** Move GeoGebra runtime attachment, listener registration, and initial rehydrate behind the real `appletOnLoad` callback instead of doing them immediately after `inject()`. Add explicit “sync from storage” entry points for the live Zustand stores, then call those entry points from backup import so UI state and the mounted canvas refresh in-place.

**Tech Stack:** React, Zustand vanilla stores, Vitest, Playwright, GeoGebra HTML5 runtime.

---

### Task 1: Add failing tests for live sync

**Files:**
- Modify: `apps/web/src/storage/backup.test.ts`
- Modify: `apps/web/src/state/scene-store.test.ts`

**Step 1:** Add a failing test that proves backup import updates live scene/UI/chat state instead of only writing `localStorage`.

**Step 2:** Add a focused store test for syncing persisted scene state back into a live store instance.

**Step 3:** Run targeted Vitest commands and confirm the new assertions fail before implementation.

### Task 2: Fix GeoGebra ready/rehydrate timing

**Files:**
- Modify: `apps/web/src/components/CanvasPanel.tsx`
- Modify: `tests/e2e/geogebra-mount.spec.ts`

**Step 1:** Introduce a single runtime-attach path that binds listeners, registers the adapter, and schedules resize from a ready callback.

**Step 2:** Pass `appletOnLoad` into the GeoGebra config and move initial `rehydrateScene()` behind that callback.

**Step 3:** Update the mock E2E runtime so it triggers `appletOnLoad`, then verify manual mutation capture and persisted replay still work.

### Task 3: Fix backup import live sync

**Files:**
- Modify: `apps/web/src/storage/backup.ts`
- Modify: `apps/web/src/state/chat-store.ts`
- Modify: `apps/web/src/state/settings-store.ts`
- Modify: `apps/web/src/state/ui-store.ts`
- Modify: `apps/web/src/state/template-store.ts`
- Modify: `apps/web/src/state/scene-store.ts`

**Step 1:** Export store-level sync helpers that reload persisted snapshots into the live store instances while preserving non-persisted UI-only flags.

**Step 2:** After writing imported snapshots to storage, call the sync helpers and rehydrate the mounted GeoGebra canvas.

**Step 3:** Re-run the targeted tests until they pass.

### Task 4: Verify with real runtime evidence

**Files:**
- No code changes required.

**Step 1:** Run focused unit/E2E tests for the changed files.

**Step 2:** Re-run a real-browser local verification script for:
- persisted scene replay on initial load
- manual GeoGebra mutation capture into scene history
- backup import immediate canvas/UI refresh

**Step 3:** Save the fresh evidence under `output/playwright/2026-03-07-continue-audit/` and only then report completion.
