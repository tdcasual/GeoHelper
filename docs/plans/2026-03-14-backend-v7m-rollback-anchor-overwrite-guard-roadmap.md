# Backend V7-M Rollback Anchor Overwrite Guard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Warn before a new manual import replaces the current single-slot rollback anchor, and require an explicit confirmation instead of silently discarding the previous undo point.

**Architecture:** Keep Route 1 browser-only and local-first. Reuse the existing local-file import preview and pulled-remote preview surfaces, extend shared import-action presentation helpers so they can combine replace-risk and rollback-anchor-overwrite-risk, and add only transient armed UI state in the settings drawer. Do not add backend state, SQL, or multi-entry local history.

**Tech Stack:** React settings drawer, browser localStorage rollback anchor, shared backup presentation helpers, Vitest, Playwright.

**Implementation status (2026-03-15):** Completed and verified. Despite the roadmap label, `V7-M` ships entirely in the browser-local Route 1 import flow: shared import guard presentation helpers, local-file overwrite guard, pulled-remote overwrite guard, and focused unit/E2E coverage.

---

### Task 1: Add shared import-action guard presentation helpers

**Files:**
- Modify: `apps/web/src/components/settings-remote-backup.ts`
- Modify: `apps/web/src/components/settings-remote-backup.test.ts`

**Step 1: Write the failing test**

Add helper tests that cover:

- local merge import without rollback anchor -> default label, no warning
- local merge import with rollback anchor -> armed confirmation label and overwrite warning
- local replace import without rollback anchor -> existing `V7-J` warning copy still works
- local replace import with rollback anchor -> combined warning about local overwrite and rollback-anchor replacement
- pulled-remote merge/replace variants mirror the same guard behavior

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @geohelper/web test -- --run src/components/settings-remote-backup.test.ts`

Expected: FAIL because current helpers only handle replace-import danger copy and do not reason about replacing an existing rollback anchor.

**Step 3: Write minimal implementation**

In `apps/web/src/components/settings-remote-backup.ts`:

- replace or extend `resolveReplaceImportConfirmationPresentation(...)`
- add a shared resolver that accepts:
  - scope (`local` or `remote_pulled`)
  - mode (`merge` or `replace`)
  - armed state
  - whether a rollback anchor already exists
  - optional compact anchor presentation inputs for warning copy
- return:
  - button label
  - warning text
  - whether the action should execute immediately or stay in armed state first

Keep the helper pure and side-effect free.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @geohelper/web test -- --run src/components/settings-remote-backup.test.ts`

Expected: PASS.

### Task 2: Guard local-file import against silent rollback-anchor replacement

**Files:**
- Modify: `apps/web/src/components/SettingsDrawer.tsx`
- Modify: `tests/e2e/settings-drawer.spec.ts`

**Step 1: Write the failing test**

Extend the local import flow so that:

1. one successful local import creates a rollback anchor
2. the user selects a second local backup file
3. the preview warns that continuing will replace the current rollback anchor
4. `合并导入（推荐）` requires one explicit confirm cycle before the second import runs
5. `覆盖导入` still uses a single confirm cycle even though both risks apply

**Step 2: Run test to verify it fails**

Run: `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "warns before replacing an existing rollback anchor on local import"`

Expected: FAIL because current local import actions still run immediately for merge and only know about replace danger, not rollback-anchor overwrite.

**Step 3: Write minimal implementation**

In `apps/web/src/components/SettingsDrawer.tsx`:

- add transient armed state for local merge confirmation when a rollback anchor exists
- compute local import button presentation from the new shared helper
- reset armed state when:
  - selected file changes
  - import preview is cancelled
  - import succeeds/fails
  - rollback anchor is cleared/restored
- ensure the import only starts after the guard helper indicates the action is fully confirmed

**Step 4: Run test to verify it passes**

Run: `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "warns before replacing an existing rollback anchor on local import"`

Expected: PASS.

### Task 3: Guard pulled-remote import against silent rollback-anchor replacement

**Files:**
- Modify: `apps/web/src/components/SettingsDrawer.tsx`
- Modify: `tests/e2e/settings-drawer.spec.ts`

**Step 1: Write the failing test**

Extend the pulled-preview flow so that:

1. an existing rollback anchor is present before remote import
2. the pulled preview warns that the current rollback anchor will be replaced
3. `拉取后导入（合并）` requires explicit confirmation before proceeding
4. `拉取后覆盖导入` keeps one confirmation cycle total even when both risks apply

**Step 2: Run test to verify it fails**

Run: `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "warns before replacing an existing rollback anchor on pulled remote import"`

Expected: FAIL because the pulled-preview buttons currently only respect stale-preview and replace-danger states.

**Step 3: Write minimal implementation**

In `apps/web/src/components/SettingsDrawer.tsx`:

- add transient armed state for pulled-preview merge confirmation when a rollback anchor exists
- reuse the shared helper for both pulled-preview buttons
- combine this guard cleanly with:
  - stale preview disabling
  - existing replace danger styling
  - remote busy states
- reset armed state when pulled preview changes, clears, succeeds, or fails

**Step 4: Run test to verify it passes**

Run: `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "warns before replacing an existing rollback anchor on pulled remote import"`

Expected: PASS.

### Task 4: Refresh roadmap docs and run focused verification

**Files:**
- Modify: `docs/plans/README.md`

**Step 1: Update roadmap index**

Document that:

- `V7-L` is now completed historical context
- `V7-M` is the proposed current latest roadmap
- the next Route 1 safety step is explicit confirmation before replacing the current rollback anchor

**Step 2: Run focused verification**

Run:

- `pnpm --filter @geohelper/web test -- --run src/components/settings-remote-backup.test.ts`
- `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "rollback anchor on local import|rollback anchor on pulled remote import"`
- `pnpm typecheck`

Expected: PASS.
