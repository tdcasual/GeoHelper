# Backend V7-G Pulled Preview Import Guidance Roadmap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enrich the pulled-remote-snapshot preview so users can see where the pulled backup came from, how it relates to the current local snapshot, and which import strategy is safer before clicking merge or replace.

**Architecture:** Keep Route 1 local-first and snapshot-based. Reuse the shared summary compare semantics already used by selected-history preflight, but bind them to the pulled preview state by capturing one local comparable summary at pull time. This remains a read-only guidance layer over the existing import buttons; do not add auto-import, dry-run merge simulation, SQL, or message-level cloud history.

**Tech Stack:** React settings drawer, `@geohelper/protocol` compare helper, existing backup export/import helpers, Vitest, Playwright.

---

### Task 1: Add pulled-preview presentation helpers

**Files:**
- Modify: `apps/web/src/components/settings-remote-backup.ts`
- Modify: `apps/web/src/components/settings-remote-backup.test.ts`

**Step 1: Write the failing test**
- Add helper tests for pulled-preview presentation:
  - latest pull + remote newer → source label + relation label + merge-first guidance
  - selected-history pull + local newer → history source label + rollback caution
  - identical → explicit no-need-to-reimport guidance

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @geohelper/web test -- --run src/components/settings-remote-backup.test.ts`

Expected: FAIL because no pulled-preview presentation helper exists yet.

**Step 3: Write minimal implementation**
- Add a helper that turns:
  - one local comparable summary captured at pull time
  - the pulled backup summary
  - the pull source kind (`latest` / `selected_history`)
  into compact preview text for the import panel.
- Keep existing generic merge/replace warning text, but add one more relation-aware recommendation line.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @geohelper/web test -- --run src/components/settings-remote-backup.test.ts`

Expected: PASS.

### Task 2: Bind pull-time local summary and render richer preview guidance

**Files:**
- Modify: `apps/web/src/components/SettingsDrawer.tsx`
- Modify: `tests/e2e/settings-drawer.spec.ts`

**Step 1: Write the failing test**
- Extend the latest-pull scenario to assert:
  - `拉取来源：云端最新快照`
  - relation versus local
  - relation-aware import recommendation
- Extend the selected-history pull scenario to assert:
  - `拉取来源：所选历史快照`
  - local-vs-pulled relation
  - rollback-oriented recommendation

**Step 2: Run test to verify it fails**

Run: `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "remote backup check compares local freshness|remote backup history allows selecting and previewing one retained historical snapshot"`

Expected: FAIL because the pulled preview panel only shows generic backup metadata today.

**Step 3: Write minimal implementation**
- When pulling a remote snapshot, export the current local backup envelope first and store its comparable summary alongside the pulled result.
- Track whether the pull came from `拉取最新快照` or `拉取所选历史快照`.
- Render source + relation + recommendation above the existing import buttons.

**Step 4: Run test to verify it passes**

Run: `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "remote backup check compares local freshness|remote backup history allows selecting and previewing one retained historical snapshot"`

Expected: PASS.

### Task 3: Refresh docs and run focused verification

**Files:**
- Modify: `README.md`
- Modify: `docs/user/settings-backup-recovery.md`
- Modify: `docs/plans/README.md`

**Step 1: Update docs**
- Explain that pulled remote previews now show source and import guidance, and that these hints are still read-only.

**Step 2: Run focused verification**

Run:
- `pnpm --filter @geohelper/web test -- --run src/components/settings-remote-backup.test.ts`
- `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "remote backup check compares local freshness|remote backup history allows selecting and previewing one retained historical snapshot"`
- `pnpm typecheck`

Expected: PASS.
