# Short Landscape Overlay Menus Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep short-landscape chat usable by making the `+` menu and slash menu overlay the composer instead of increasing composer height.

**Architecture:** Preserve the existing `WorkspaceShell` structure and use the current Playwright responsive suite as the behavioral contract. Fix the root cause in CSS first by changing short-landscape menu positioning, keeping the composer anchored inside the viewport while maintaining a usable message area.

**Tech Stack:** React, TypeScript, Vite, Playwright, CSS

---

### Task 1: Lock the regression with failing tests

**Files:**
- Modify: `tests/e2e/fullscreen-toggle.spec.ts`
- Test: `tests/e2e/fullscreen-toggle.spec.ts`

**Step 1: Write the failing test**
- Add a short-landscape `+` menu assertion that keeps `.chat-messages` height usable.
- Add a short-landscape slash menu assertion that keeps the composer within the viewport and caps menu height.

**Step 2: Run test to verify it fails**
Run: `pnpm exec playwright test tests/e2e/fullscreen-toggle.spec.ts --grep "short landscape plus menu keeps message area usable|short landscape slash menu stays within viewport"`
Expected: FAIL with message area height or viewport bounds assertion failure.

**Step 3: Commit**
Run after green, together with implementation task.

### Task 2: Fix short-landscape menu layout with minimal CSS

**Files:**
- Modify: `apps/web/src/styles.css`
- Inspect: `apps/web/src/components/WorkspaceShell.tsx`
- Test: `tests/e2e/fullscreen-toggle.spec.ts`

**Step 1: Find root cause**
- Confirm both menus live inside `.chat-composer` and currently contribute to normal document flow.
- Confirm short viewport styles only shrink sizes but do not change flow behavior.

**Step 2: Write minimal implementation**
- Make `.chat-composer` the positioning container for short-landscape chat.
- Convert `.plus-menu` and `.slash-command-menu` to absolute overlay surfaces in `short-viewport + compact-viewport + mobile-surface-chat`.
- Ensure menus do not increase composer height.
- Keep menus scrollable and within viewport, with slash menu `max-height <= 96px`.

**Step 3: Run tests to verify it passes**
Run: `pnpm exec playwright test tests/e2e/fullscreen-toggle.spec.ts --grep "short landscape plus menu keeps message area usable|short landscape slash menu stays within viewport"`
Expected: PASS.

### Task 3: Verify no regressions in the responsive surface

**Files:**
- Verify: `tests/e2e/fullscreen-toggle.spec.ts`
- Verify: `tests/e2e/geogebra-mount.spec.ts`

**Step 1: Run focused regression suite**
Run: `pnpm exec playwright test tests/e2e/geogebra-mount.spec.ts tests/e2e/fullscreen-toggle.spec.ts`
Expected: PASS.

**Step 2: Run typecheck**
Run: `pnpm typecheck`
Expected: PASS, or report only pre-existing unrelated failures with evidence.

**Step 3: Run web build**
Run: `pnpm --filter @geohelper/web build`
Expected: PASS.

**Step 4: Commit**
Run: `git add apps/web/src/styles.css tests/e2e/fullscreen-toggle.spec.ts docs/plans/2026-03-08-short-landscape-overlay-menus-implementation-plan.md && git commit -m "fix: stabilize short landscape menus"`
