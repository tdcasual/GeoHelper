# Backend V7-H Selected History Pull Stale Guard Roadmap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent users from importing an old pulled historical snapshot after they have already switched the selected history item to a different recovery point.

**Architecture:** Keep Route 1 local-first and snapshot-based. Reuse the pulled-preview state introduced in V7-G, but add one small guard layer that compares the current selected retained snapshot with the pulled preview target. This remains a browser-only safety enhancement: no new backend calls, no auto-pull, no SQL, and no automatic import. The only behavior change is clearer target labeling plus disabling import actions when a selected-history preview becomes stale.

**Tech Stack:** React settings drawer, existing remote-backup helpers/state, Vitest, Playwright.

---

### Task 1: Add stale-preview guard presentation helpers

**Files:**
- Modify: `apps/web/src/components/settings-remote-backup.ts`
- Modify: `apps/web/src/components/settings-remote-backup.test.ts`

**Step 1: Write the failing test**
- Add helper tests for pulled preview target/guard presentation:
  - latest pull → explicit target label, import still enabled
  - selected-history pull with same current selection → no warning, import enabled
  - selected-history pull with different current selection → warning shown, import disabled

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @geohelper/web test -- --run src/components/settings-remote-backup.test.ts`

Expected: FAIL because no stale-preview guard helper exists yet.

**Step 3: Write minimal implementation**
- Add one helper that derives:
  - target label
  - stale warning text
  - whether import buttons should remain enabled
- Only guard `selected_history` pulls; latest pulls remain importable.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @geohelper/web test -- --run src/components/settings-remote-backup.test.ts`

Expected: PASS.

### Task 2: Render guard state in the pulled preview panel

**Files:**
- Modify: `apps/web/src/components/SettingsDrawer.tsx`
- Modify: `tests/e2e/settings-drawer.spec.ts`

**Step 1: Write the failing test**
- Extend the selected-history scenario:
  - pull `snap-remote-1`
  - switch selection back to `snap-remote-2`
  - assert the preview panel warns that the current selection differs from the pulled preview
  - assert `拉取后导入（合并）` / `拉取后覆盖导入` are disabled until the user re-pulls

**Step 2: Run test to verify it fails**

Run: `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "remote backup history allows selecting and previewing one retained historical snapshot"`

Expected: FAIL because the current UI keeps the old pulled preview import buttons active even after selection changes.

**Step 3: Write minimal implementation**
- Compute stale state from:
  - pulled preview source
  - pulled preview snapshot id
  - current selected retained snapshot id
- Render one explicit target line plus a warning when stale.
- Disable import buttons while stale; keep `清除本次拉取` available.

**Step 4: Run test to verify it passes**

Run: `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "remote backup history allows selecting and previewing one retained historical snapshot"`

Expected: PASS.

### Task 3: Refresh docs and run focused verification

**Files:**
- Modify: `README.md`
- Modify: `docs/user/settings-backup-recovery.md`
- Modify: `docs/plans/README.md`

**Step 1: Update docs**
- Document that switching selected history after a historical pull will mark the preview stale and block import until the user re-pulls the newly selected snapshot.

**Step 2: Run focused verification**

Run:
- `pnpm --filter @geohelper/web test -- --run src/components/settings-remote-backup.test.ts`
- `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "remote backup history allows selecting and previewing one retained historical snapshot"`
- `pnpm typecheck`

Expected: PASS.
