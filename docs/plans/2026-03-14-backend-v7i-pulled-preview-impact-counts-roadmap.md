# Backend V7-I Pulled Preview Impact Counts Roadmap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show conversation-level merge/replace impact counts inside the pulled preview so users can estimate what import will do before they click merge or replace.

**Architecture:** Keep Route 1 local-first and snapshot-based. Reuse the pulled preview state introduced in V7-G and extend it with one local envelope snapshot captured at pull time, then compute read-only conversation impact counts from the local/pulled envelopes in the web layer. Do not simulate a full import, mutate local data, or add SQL/server state; this is only a conversation-level preview hint.

**Tech Stack:** React settings drawer, existing backup envelope helpers, Vitest, Playwright.

---

### Task 1: Add pulled-preview conversation impact helpers

**Files:**
- Modify: `apps/web/src/components/settings-remote-backup.ts`
- Modify: `apps/web/src/components/settings-remote-backup.test.ts`

**Step 1: Write the failing test**
- Add helper tests for conversation impact preview:
  - merge with only-new remote conversations
  - merge with one overlapping remote conversation that wins by `updatedAt`
  - merge with one overlapping local conversation that stays because local is newer
  - replace preview showing remote-count replaces local-count

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @geohelper/web test -- --run src/components/settings-remote-backup.test.ts`

Expected: FAIL because no conversation impact preview helper exists yet.

**Step 3: Write minimal implementation**
- Add one helper that computes read-only conversation impact from:
  - local envelope captured at pull time
  - pulled remote envelope
- Surface:
  - one merge summary line
  - one replace summary line
- Keep scope explicit: this is conversation-level impact only, not a full settings/template dry-run.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @geohelper/web test -- --run src/components/settings-remote-backup.test.ts`

Expected: PASS.

### Task 2: Render impact counts in the pulled preview panel

**Files:**
- Modify: `apps/web/src/components/SettingsDrawer.tsx`
- Modify: `tests/e2e/settings-drawer.spec.ts`

**Step 1: Write the failing test**
- Extend the latest-pull scenario to assert a conversation impact summary for merge/replace.
- Extend the selected-history scenario to assert a conversation impact summary for merge/replace.

**Step 2: Run test to verify it fails**

Run: `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "metadata-only|previewing one retained historical snapshot"`

Expected: FAIL because the preview panel currently has no impact-count lines.

**Step 3: Write minimal implementation**
- Store the local envelope captured at pull time alongside the pulled preview state.
- Render one `导入影响预估（按会话）` block inside the pulled preview panel.
- Keep wording explicit that counts are conversation-level hints.

**Step 4: Run test to verify it passes**

Run: `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "metadata-only|previewing one retained historical snapshot"`

Expected: PASS.

### Task 3: Refresh docs and run focused verification

**Files:**
- Modify: `README.md`
- Modify: `docs/user/settings-backup-recovery.md`
- Modify: `docs/plans/README.md`

**Step 1: Update docs**
- Explain that pulled previews now show conversation-level merge/replace impact counts in addition to relation guidance.

**Step 2: Run focused verification**

Run:
- `pnpm --filter @geohelper/web test -- --run src/components/settings-remote-backup.test.ts`
- `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "metadata-only|previewing one retained historical snapshot"`
- `pnpm typecheck`

Expected: PASS.
