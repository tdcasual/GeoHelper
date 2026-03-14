# Backend V7-K Import Rollback Anchor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Capture one local rollback anchor before each manual import and let the user restore the pre-import local state from settings after the import completes.

**Architecture:** Keep Route 1 local-first and browser-only. Add a single-slot rollback anchor stored in local storage, owned by the web backup module, and surface it in the existing settings recovery UI. Do not add backend state, SQL, remote persistence, or background restore behavior.

**Tech Stack:** React settings drawer, browser localStorage, shared `BackupEnvelope`, Vitest, Playwright.

---

### Task 1: Add rollback anchor storage primitives

**Files:**
- Modify: `apps/web/src/storage/backup.ts`
- Modify: `apps/web/src/storage/backup.test.ts`

**Step 1: Write the failing test**

Add storage tests for:

- capturing a rollback anchor before import
- reading it back with metadata
- replacing the previous anchor when a newer one is captured
- clearing the anchor explicitly

Use one small synthetic `BackupEnvelope` fixture plus pre-populated local storage snapshots.

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @geohelper/web test -- --run src/storage/backup.test.ts`

Expected: FAIL because rollback-anchor helpers and storage key do not exist yet.

**Step 3: Write minimal implementation**

In `apps/web/src/storage/backup.ts`, add:

- `ImportRollbackAnchorSource`
- `ImportRollbackAnchor`
- `captureCurrentAppImportRollbackAnchor(params)`
- `readImportRollbackAnchor()`
- `clearImportRollbackAnchor()`

Store the full current `BackupEnvelope` plus minimal metadata under one dedicated local storage key.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @geohelper/web test -- --run src/storage/backup.test.ts`

Expected: PASS.

### Task 2: Add restore-from-anchor behavior

**Files:**
- Modify: `apps/web/src/storage/backup.ts`
- Modify: `apps/web/src/storage/backup.test.ts`

**Step 1: Write the failing test**

Add tests proving that:

- restoring from the stored anchor performs a replace-style local restore
- the restored chat/settings/ui/template/scene snapshots match the pre-import state
- the anchor is cleared after a successful restore

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @geohelper/web test -- --run src/storage/backup.test.ts`

Expected: FAIL because restore-from-anchor helper does not exist yet.

**Step 3: Write minimal implementation**

In `apps/web/src/storage/backup.ts`, add:

- `restoreImportRollbackAnchorToLocalStorage()`

Implementation notes:

- read the stored anchor
- throw a clear error if no anchor exists
- restore its `envelope` through existing local import primitives using replace semantics
- clear the anchor after success

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @geohelper/web test -- --run src/storage/backup.test.ts`

Expected: PASS.

### Task 3: Add rollback anchor presentation helpers

**Files:**
- Modify: `apps/web/src/components/settings-remote-backup.ts`
- Modify: `apps/web/src/components/settings-remote-backup.test.ts`

**Step 1: Write the failing test**

Add helper tests for compact rollback anchor presentation:

- local-file merge import
- local-file replace import
- remote latest replace import
- remote selected-history merge import

Expected outputs should include:

- source label
- import mode label
- summary line with snapshot id and conversation count

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @geohelper/web test -- --run src/components/settings-remote-backup.test.ts`

Expected: FAIL because rollback-anchor presentation helper does not exist yet.

**Step 3: Write minimal implementation**

Add one helper such as:

- `resolveImportRollbackAnchorPresentation(anchor)`

Return read-only UI strings only; no side effects.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @geohelper/web test -- --run src/components/settings-remote-backup.test.ts`

Expected: PASS.

### Task 4: Capture rollback anchors before local and remote imports

**Files:**
- Modify: `apps/web/src/components/SettingsDrawer.tsx`
- Test: `tests/e2e/settings-drawer.spec.ts`

**Step 1: Write the failing test**

Extend E2E coverage so that:

1. a local import creates a visible rollback anchor card after reload
2. a pulled-remote import creates a rollback anchor card after reload

For each flow, assert that the card shows the expected source label and restore button.

**Step 2: Run test to verify it fails**

Run: `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "creates a rollback anchor after local import|creates a rollback anchor after remote import"`

Expected: FAIL because imports do not currently capture or show rollback anchors.

**Step 3: Write minimal implementation**

In `SettingsDrawer.tsx`:

- load rollback anchor state on mount
- before every manual local-state import, capture the current local state anchor
- if capture fails, abort the import and show an explicit message
- refresh rollback anchor UI state after capture

Covered handlers:

- `handleImportBackup("merge" | "replace")`
- `handleImportPulledRemoteBackup("merge" | "replace")`

**Step 4: Run test to verify it passes**

Run: `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "creates a rollback anchor after local import|creates a rollback anchor after remote import"`

Expected: PASS.

### Task 5: Add restore and clear actions in settings

**Files:**
- Modify: `apps/web/src/components/SettingsDrawer.tsx`
- Modify: `tests/e2e/settings-drawer.spec.ts`

**Step 1: Write the failing test**

Add E2E coverage proving that:

- clicking `恢复到导入前状态` restores the pre-import local snapshot
- clicking `清除此恢复锚点` removes the card without mutating current chat data

At least one test should verify a real content rollback by checking local storage before import, after import, and after restore.

**Step 2: Run test to verify it fails**

Run: `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "restores the pre-import local snapshot|clears rollback anchor without mutating chat state"`

Expected: FAIL because no rollback anchor actions exist yet.

**Step 3: Write minimal implementation**

In `SettingsDrawer.tsx`:

- render a rollback anchor card when one exists
- show formatted source/mode/summary labels
- add `恢复到导入前状态`
- add `清除此恢复锚点`
- update `backupMessage`
- reload after successful restore to keep behavior aligned with current import flows

Use existing `settings-import-preview`, `settings-hint`, and inline action styles where possible.

**Step 4: Run test to verify it passes**

Run: `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "restores the pre-import local snapshot|clears rollback anchor without mutating chat state"`

Expected: PASS.

### Task 6: Refresh docs and roadmap index

**Files:**
- Modify: `README.md`
- Modify: `docs/user/settings-backup-recovery.md`
- Modify: `docs/plans/README.md`
- Create: `docs/plans/2026-03-14-backend-v7k-import-rollback-anchor-design.md`

**Step 1: Update docs**

Document that:

- manual imports now create a local rollback anchor first
- rollback anchor is browser-local only
- users can restore the pre-import local state from settings
- the feature still does not add SQL or cloud chat history sync

**Step 2: Run focused verification**

Run:

- `pnpm --filter @geohelper/web test -- --run src/storage/backup.test.ts`
- `pnpm --filter @geohelper/web test -- --run src/components/settings-remote-backup.test.ts`
- `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "rollback anchor|pre-import local snapshot"`
- `pnpm typecheck`

Expected: PASS.
