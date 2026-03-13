# Backend V7-F History Relation Badges Roadmap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Surface the local-vs-remote relation for every retained remote snapshot directly inside the history list so users can scan recovery candidates before opening the selected detail panel.

**Architecture:** Keep Route 1 local-first and snapshot-based. Reuse the shared comparable-summary relation logic added in V7-E and derive compact list-item badges from the same local summary already returned by compare. Do not add background sync, server-side state, SQL, or automatic restore behavior; this is a presentation-only guidance layer over retained snapshot history.

**Tech Stack:** React settings drawer, `@geohelper/protocol` compare helper, existing remote-backup state, Vitest, Playwright.

---

### Task 1: Add compact relation badge helpers for retained history items

**Files:**
- Modify: `apps/web/src/components/settings-remote-backup.ts`
- Modify: `apps/web/src/components/settings-remote-backup.test.ts`

**Step 1: Write the failing test**
- Add helper tests for converting one retained snapshot plus the current local summary into short list badges:
  - identical → `内容一致`
  - local newer → `本地较新`
  - selected remote newer → `云端较新`
  - diverged → `已分叉`
  - no local summary → `null`

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @geohelper/web test -- --run src/components/settings-remote-backup.test.ts`

Expected: FAIL because no list-badge helper exists yet.

**Step 3: Write minimal implementation**
- Add a small presentation helper returning compact badge text and a stable tone/class key.
- Reuse `compareBackupComparableSummaries()` through the existing settings helper module.
- Keep the long selected-detail recommendation text unchanged.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @geohelper/web test -- --run src/components/settings-remote-backup.test.ts`

Expected: PASS.

### Task 2: Render history list relation badges in the settings drawer

**Files:**
- Modify: `apps/web/src/components/SettingsDrawer.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `tests/e2e/settings-drawer.spec.ts`

**Step 1: Write the failing test**
- Extend the retained-history Playwright scenario so the list itself shows relation badges:
  - default latest item shows `云端较新`
  - older retained item shows `本地较新`
- Keep the selected detail assertions from V7-E.

**Step 2: Run test to verify it fails**

Run: `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "remote backup history allows selecting and previewing one retained historical snapshot"`

Expected: FAIL because the list item buttons do not render relation badges yet.

**Step 3: Write minimal implementation**
- Compute compact relation presentation for each retained snapshot from `remoteBackupSync.lastComparison?.local_snapshot.summary`.
- Render the badge inside each history item button without changing selection behavior.
- Add minimal styling so badges wrap cleanly and remain readable on narrow widths.

**Step 4: Run test to verify it passes**

Run: `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "remote backup history allows selecting and previewing one retained historical snapshot"`

Expected: PASS.

### Task 3: Refresh docs and run the focused verification matrix

**Files:**
- Modify: `README.md`
- Modify: `docs/user/settings-backup-recovery.md`
- Modify: `docs/plans/README.md`

**Step 1: Update docs**
- Document that retained history list items now show compact local relation badges in addition to the selected snapshot detail panel.
- Keep wording explicit that this is still read-only guidance, not automatic sync or full cloud history.

**Step 2: Run focused verification**

Run:
- `pnpm --filter @geohelper/web test -- --run src/components/settings-remote-backup.test.ts`
- `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "remote backup history allows selecting and previewing one retained historical snapshot"`
- `pnpm typecheck`

Expected: PASS.
