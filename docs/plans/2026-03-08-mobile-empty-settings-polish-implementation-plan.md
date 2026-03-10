# Mobile Empty State And Short Settings Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Center the compact empty state inside the chat surface and make short-height settings modals expose more usable content immediately.

**Architecture:** Keep the existing React structure and responsive CSS system. Lock regressions with Playwright first, then use minimal JSX/CSS changes: reuse the existing empty-state centering container for compact chat, and add a short-height settings layout branch that reclaims vertical space without changing desktop behavior.

**Tech Stack:** React, TypeScript, CSS, Playwright

---

### Task 1: Lock the empty-state regression

**Files:**
- Modify: `tests/e2e/fullscreen-toggle.spec.ts`
- Inspect: `apps/web/src/components/WorkspaceShell.tsx`
- Inspect: `apps/web/src/styles.css`

**Step 1: Write the failing test**
- Add a compact portrait test that opens chat on `390x844` and asserts the compact empty state is vertically centered within the chat message region.

**Step 2: Run test to verify it fails**
Run: `pnpm exec playwright test tests/e2e/fullscreen-toggle.spec.ts --grep "compact portrait empty state stays vertically centered"`
Expected: FAIL with a large center delta.

### Task 2: Lock the short-settings density regression

**Files:**
- Modify: `tests/e2e/settings-drawer.spec.ts`
- Inspect: `apps/web/src/components/SettingsDrawer.tsx`
- Inspect: `apps/web/src/styles.css`

**Step 1: Write the failing test**
- Add a short-landscape settings test on `844x390` that asserts the settings content viewport keeps a useful minimum height and the modal stays inside the viewport.

**Step 2: Run test to verify it fails**
Run: `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "short landscape settings keeps content viewport usable"`
Expected: FAIL on content viewport height.

### Task 3: Implement the minimal fixes

**Files:**
- Modify: `apps/web/src/components/WorkspaceShell.tsx`
- Modify: `apps/web/src/styles.css`

**Step 1: Fix compact empty-state centering**
- Wrap the compact empty state with the existing centering container so the card is centered in the available chat message region.

**Step 2: Fix short-height settings density**
- Add a short-height settings media branch.
- Reduce modal padding and header spacing.
- Prefer side navigation for short-but-wide settings layouts.
- Increase `.settings-content` viewport height while keeping scroll behavior intact.

**Step 3: Run targeted tests to verify green**
Run: `pnpm exec playwright test tests/e2e/fullscreen-toggle.spec.ts --grep "compact portrait empty state stays vertically centered"`
Run: `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "short landscape settings keeps content viewport usable"`
Expected: PASS.

### Task 4: Verify regressions and continue audit

**Files:**
- Verify: `tests/e2e/fullscreen-toggle.spec.ts`
- Verify: `tests/e2e/settings-drawer.spec.ts`
- Verify: `apps/web/src/styles.css`

**Step 1: Run focused responsive suite**
Run: `pnpm exec playwright test tests/e2e/fullscreen-toggle.spec.ts tests/e2e/settings-drawer.spec.ts`
Expected: PASS.

**Step 2: Run typecheck and build**
Run: `pnpm typecheck`
Run: `pnpm --filter @geohelper/web build`
Expected: PASS.

**Step 3: Continue UI audit**
- Re-run local screenshot + metrics audit for the touched surfaces.
- Report any new issues with evidence.
