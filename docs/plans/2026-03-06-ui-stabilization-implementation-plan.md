# Mobile/Desktop UI Stabilization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the remaining mobile/desktop UI bugs and land the audit recommendations P0-P6 with regression coverage and visual verification.

**Architecture:** Keep the current `WorkspaceShell` + `CanvasPanel` structure, but split responsive concerns explicitly: mobile uses view tabs and overlay drawers, desktop keeps split panes. GeoGebra runtime sizing is hardened by reacting to viewport-mode changes and forcing a fresh mount when the UI profile changes.

**Tech Stack:** React 19, Zustand, Vite, Playwright, Vitest, TypeScript

---

### Task 1: Lock down the regressions with failing e2e tests

**Files:**
- Modify: `tests/e2e/fullscreen-toggle.spec.ts`
- Modify: `tests/e2e/conversation-sidebar.spec.ts`
- Modify: `tests/e2e/geogebra-mount.spec.ts`

**Step 1:** Add a failing mobile assertion proving the history drawer no longer overlaps the composer.

**Step 2:** Add a failing responsive assertion proving GeoGebra resizes correctly after desktop → mobile viewport changes.

**Step 3:** Add assertions for mobile-first controls/text so later UI changes stay intentional.

**Step 4:** Run the targeted Playwright specs and confirm they fail for the current behavior.

### Task 2: Rebuild mobile chat/history layout

**Files:**
- Modify: `apps/web/src/components/WorkspaceShell.tsx`
- Modify: `apps/web/src/components/ChatPanel.tsx`
- Modify: `apps/web/src/styles.css`

**Step 1:** Introduce mobile surface switching (`画布` / `对话`) and a compact top-bar overflow model.

**Step 2:** Convert mobile history into an overlay bottom sheet with its own backdrop and close affordance.

**Step 3:** Make the composer denser on mobile and ensure the chat region can fully own the viewport height.

**Step 4:** Keep desktop/tablet split-pane behavior unchanged.

### Task 3: Harden GeoGebra viewport behavior

**Files:**
- Modify: `apps/web/src/components/CanvasPanel.tsx`
- Modify: `apps/web/src/components/WorkspaceShell.tsx`
- Modify: `tests/e2e/geogebra-mount.spec.ts`

**Step 1:** Pass an explicit UI profile into `CanvasPanel` (`desktop` vs `mobile`).

**Step 2:** Re-mount the applet when the profile changes so mobile and desktop configs do not share stale internal scaler state.

**Step 3:** Add extra resize scheduling hooks for viewport/orientation/chat-layout changes.

**Step 4:** Keep fullscreen enabled while trimming mobile chrome.

### Task 4: Unify labels and action hierarchy

**Files:**
- Modify: `apps/web/src/components/WorkspaceShell.tsx`
- Modify: `apps/web/src/components/ModelModeSwitcher.tsx`
- Modify: `apps/web/src/styles.css`

**Step 1:** Replace mixed English labels with Chinese-facing text.

**Step 2:** Re-style top-bar buttons into primary/secondary/ghost hierarchy.

**Step 3:** Move low-frequency actions into a mobile overflow menu.

### Task 5: Verify end-to-end and document evidence

**Files:**
- Modify: `docs/plans/2026-03-06-ui-stabilization-implementation-plan.md`

**Step 1:** Run targeted Playwright specs for the touched behavior.

**Step 2:** Run focused Vitest checks if component helpers change.

**Step 3:** Run the web build to ensure the UI compiles.

**Step 4:** Capture fresh desktop/mobile screenshots and summarize what changed.
