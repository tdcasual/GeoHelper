# Backend V7-L Import Outcome Summary Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show what the latest manual import actually changed and warn when restoring the rollback anchor would also discard newer local changes made after that import.

**Architecture:** Keep Route 1 browser-only. Extend the existing single-slot rollback anchor with optional post-import result metadata, compute compact actual-change summaries in shared presentation helpers, and render them inside the existing settings rollback card. Do not add backend state, SQL, or multi-entry local history.

**Tech Stack:** React settings drawer, browser localStorage, shared `BackupEnvelope`, protocol comparison helpers, Vitest, Playwright.

---

### Task 1: Extend rollback anchor storage with post-import result metadata

**Files:**
- Modify: `apps/web/src/storage/backup.ts`
- Modify: `apps/web/src/storage/backup.test.ts`

**Step 1: Write the failing test**

Add storage tests proving that:

- a captured rollback anchor can later record a post-import result envelope
- reading the anchor returns `importedAt` and `resultEnvelope`
- legacy anchors without these fields still parse correctly

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @geohelper/web test -- --run src/storage/backup.test.ts`

Expected: FAIL because rollback anchors cannot yet persist post-import result data.

**Step 3: Write minimal implementation**

In `apps/web/src/storage/backup.ts`, add one helper such as:

- `recordCurrentAppImportRollbackResult()`

Implementation notes:

- read the current rollback anchor
- throw a clear error if no anchor exists
- export the current app backup envelope
- save it back into the existing anchor as `resultEnvelope`
- stamp `importedAt`

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @geohelper/web test -- --run src/storage/backup.test.ts`

Expected: PASS.

### Task 2: Add shared import outcome presentation helpers

**Files:**
- Modify: `apps/web/src/components/settings-remote-backup.ts`
- Modify: `apps/web/src/components/settings-remote-backup.test.ts`

**Step 1: Write the failing test**

Add presentation tests for:

- merge import outcome summary
- replace import outcome summary
- unchanged current-state relation after import
- changed current-state warning after later local edits

Expected outputs should include:

- pre-import summary
- post-import summary
- actual outcome summary
- rollback warning/hint copy

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @geohelper/web test -- --run src/components/settings-remote-backup.test.ts`

Expected: FAIL because the rollback card formatter cannot yet describe post-import results or current-state drift.

**Step 3: Write minimal implementation**

Refactor or add helpers in `apps/web/src/components/settings-remote-backup.ts`:

- one reusable conversation-change stats helper
- extended `resolveImportRollbackAnchorPresentation(...)`

Implementation notes:

- reuse `compareBackupComparableSummaries`
- keep outputs read-only and side-effect free
- accept current local summary as an optional input for drift warnings

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @geohelper/web test -- --run src/components/settings-remote-backup.test.ts`

Expected: PASS.

### Task 3: Record import results after successful local and remote imports

**Files:**
- Modify: `apps/web/src/components/SettingsDrawer.tsx`
- Modify: `tests/e2e/settings-drawer.spec.ts`

**Step 1: Write the failing test**

Extend E2E coverage so that after a successful local import and a successful pulled-remote import, the rollback card shows:

- pre-import snapshot summary
- post-import snapshot summary
- actual outcome summary

**Step 2: Run test to verify it fails**

Run: `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "shows import outcome summary after local import|shows import outcome summary after remote import"`

Expected: FAIL because successful imports do not yet persist post-import result metadata.

**Step 3: Write minimal implementation**

In `SettingsDrawer.tsx`:

- after successful `importAppBackupToLocalStorage(...)`, record current import result into the rollback anchor
- after successful `importRemoteBackupToLocalStorage(...)`, do the same
- reload only after result metadata is persisted

If recording the post-import result fails:

- keep the already imported local state
- show a clear message
- still avoid silent data corruption claims

**Step 4: Run test to verify it passes**

Run: `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "shows import outcome summary after local import|shows import outcome summary after remote import"`

Expected: PASS.

### Task 4: Warn when local state has changed after the import

**Files:**
- Modify: `apps/web/src/components/SettingsDrawer.tsx`
- Modify: `tests/e2e/settings-drawer.spec.ts`

**Step 1: Write the failing test**

Add an E2E flow that:

- performs one import
- mutates local storage afterward
- reopens settings
- sees warning copy that restoring now would discard newer post-import local changes too

**Step 2: Run test to verify it fails**

Run: `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "warns when rollback would discard newer post-import changes"`

Expected: FAIL because the rollback card does not yet compare current local state with the stored import result.

**Step 3: Write minimal implementation**

In `SettingsDrawer.tsx`:

- export the current local envelope when opening settings
- pass its comparable summary into the rollback presentation helper
- render the returned current-state status/warning strings

**Step 4: Run test to verify it passes**

Run: `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "warns when rollback would discard newer post-import changes"`

Expected: PASS.

### Task 5: Refresh docs and roadmap index

**Files:**
- Modify: `README.md`
- Modify: `docs/user/settings-backup-recovery.md`
- Modify: `docs/plans/README.md`
- Create: `docs/plans/2026-03-14-backend-v7l-import-outcome-summary-design.md`
- Create: `docs/plans/2026-03-14-backend-v7l-import-outcome-summary-roadmap.md`

**Step 1: Update docs**

Document that:

- manual imports now remember both pre-import rollback state and post-import result context
- the rollback card explains actual import results
- rollback warns if newer local edits exist after the import
- the feature remains browser-local only and does not add SQL or cloud chat history sync

**Step 2: Run focused verification**

Run:

- `pnpm --filter @geohelper/web test -- --run src/storage/backup.test.ts`
- `pnpm --filter @geohelper/web test -- --run src/components/settings-remote-backup.test.ts`
- `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "import outcome summary|rollback would discard newer post-import changes"`
- `pnpm typecheck`

Expected: PASS.
