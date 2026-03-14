# Backend V7-J Replace Import Confirmation Roadmap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add explicit second-click confirmation before dangerous replace imports so users do not overwrite local data by accident.

**Architecture:** Keep Route 1 local-first and snapshot-based. Add a UI-only confirmation layer on top of existing local-backup replace import and pulled-remote replace import actions. Do not add modal flows, backend calls, or browser-native confirm dialogs; use inline arming state plus warning copy so the user must click twice before destructive replace imports run.

**Tech Stack:** React settings drawer, existing backup import handlers, Vitest, Playwright.

---

### Task 1: Add replace-confirmation presentation helpers

**Files:**
- Modify: `apps/web/src/components/settings-remote-backup.ts`
- Modify: `apps/web/src/components/settings-remote-backup.test.ts`

**Step 1: Write the failing test**
- Add helper tests for:
  - local replace not armed
  - local replace armed
  - remote pulled replace not armed
  - remote pulled replace armed

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @geohelper/web test -- --run src/components/settings-remote-backup.test.ts`

Expected: FAIL because no replace-confirmation helper exists yet.

**Step 3: Write minimal implementation**
- Add a small helper that returns:
  - button label
  - warning text
for `local` and `remote_pulled` replace scopes.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @geohelper/web test -- --run src/components/settings-remote-backup.test.ts`

Expected: PASS.

### Task 2: Gate replace imports behind a second click

**Files:**
- Modify: `apps/web/src/components/SettingsDrawer.tsx`
- Modify: `tests/e2e/settings-drawer.spec.ts`

**Step 1: Write the failing test**
- Extend local replace import E2E:
  - first click only arms replace and shows warning
  - second click confirms and performs replace
- Extend remote latest-pull preview E2E:
  - first click only arms remote replace and shows warning
  - local data remains unchanged until explicit confirmation

**Step 2: Run test to verify it fails**

Run: `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "replaces local snapshot when import mode is replace|metadata-only until user explicitly imports"`

Expected: FAIL because replace imports currently execute on the first click.

**Step 3: Write minimal implementation**
- Add one arming state for local replace import and one for pulled-remote replace import.
- First click arms and shows warning text.
- Second click performs the existing replace import handler.
- Reset arming state when preview source changes, is cleared, or a safe action is chosen instead.

**Step 4: Run test to verify it passes**

Run: `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "replaces local snapshot when import mode is replace|metadata-only until user explicitly imports"`

Expected: PASS.

### Task 3: Refresh docs and run focused verification

**Files:**
- Modify: `README.md`
- Modify: `docs/user/settings-backup-recovery.md`
- Modify: `docs/plans/README.md`

**Step 1: Update docs**
- Explain that replace imports now require explicit second-click confirmation in both local backup import and pulled remote preview flows.

**Step 2: Run focused verification**

Run:
- `pnpm --filter @geohelper/web test -- --run src/components/settings-remote-backup.test.ts`
- `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "replaces local snapshot when import mode is replace|metadata-only until user explicitly imports"`
- `pnpm typecheck`

Expected: PASS.
