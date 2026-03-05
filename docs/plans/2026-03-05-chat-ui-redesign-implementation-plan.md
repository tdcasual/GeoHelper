# Chat UI Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver the new chat experience with chat visible by default, history hidden by default, resizable push-layout history drawer, slash-first composer interactions, and a ChatGPT-style plus menu across desktop/tablet/mobile.

**Architecture:** Introduce explicit UI state for history drawer visibility and width, split composer concerns into reusable components, and route slash commands and plus-menu actions through a shared action registry. Keep message send/runtime logic unchanged while replacing interaction shell and layout behavior.

**Tech Stack:** React 19, Zustand, Vite, Vitest, Playwright, CSS

---

### Task 1: Extend UI State For History Drawer Defaults

**Files:**
- Modify: `apps/web/src/state/ui-store.ts`
- Test: `apps/web/src/state/ui-store.test.ts`

**Step 1: Write failing tests**

Add tests for:
1. `chatVisible` defaults to `true`.
2. `historyDrawerVisible` defaults to `false`.
3. `historyDrawerWidth` defaults to bounded value.
4. Toggle/set APIs persist correctly.

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @geohelper/web test apps/web/src/state/ui-store.test.ts`  
Expected: FAIL for missing state fields/APIs.

**Step 3: Write minimal implementation**

Add persisted fields:
1. `historyDrawerVisible`
2. `historyDrawerWidth`
3. `toggleHistoryDrawer`
4. `setHistoryDrawerVisible`
5. `setHistoryDrawerWidth` (with clamp)

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @geohelper/web test apps/web/src/state/ui-store.test.ts`  
Expected: PASS.

### Task 2: Add History Drawer UI With Push Layout And Resize

**Files:**
- Modify: `apps/web/src/components/WorkspaceShell.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `tests/e2e/conversation-sidebar.spec.ts`

**Step 1: Write failing E2E tests**

Add tests for:
1. History is hidden on first load.
2. Toggling history shows conversation list.
3. Resize handle changes drawer width and keeps bounds.

**Step 2: Run test to verify it fails**

Run: `pnpm test:e2e tests/e2e/conversation-sidebar.spec.ts`  
Expected: FAIL due to missing controls/behavior.

**Step 3: Write minimal implementation**

Add:
1. History toggle button in chat header.
2. Drawer wrapper class that pushes chat body.
3. Drag resizer with pointer events.
4. Width persistence through UI store.

**Step 4: Run test to verify it passes**

Run: `pnpm test:e2e tests/e2e/conversation-sidebar.spec.ts`  
Expected: PASS.

### Task 3: Replace Input Row With New Composer (Slash + Plus Menu)

**Files:**
- Modify: `apps/web/src/components/WorkspaceShell.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `tests/e2e/chat-to-render.spec.ts`

**Step 1: Write failing E2E tests**

Add tests for:
1. Composer uses textarea and supports Enter send + Shift+Enter newline.
2. Slash menu appears on `/` input and inserts template text.
3. Plus menu opens and can apply template action.

**Step 2: Run test to verify it fails**

Run: `pnpm test:e2e tests/e2e/chat-to-render.spec.ts`  
Expected: FAIL for missing composer behaviors.

**Step 3: Write minimal implementation**

Implement:
1. `textarea` composer with keyboard handling.
2. Slash palette + action registry (template-first).
3. Plus menu using same action handlers.

**Step 4: Run test to verify it passes**

Run: `pnpm test:e2e tests/e2e/chat-to-render.spec.ts`  
Expected: PASS.

### Task 4: Conversation Draft Persistence By Thread

**Files:**
- Modify: `apps/web/src/components/WorkspaceShell.tsx`
- Test: `tests/e2e/conversation-sidebar.spec.ts`

**Step 1: Write failing E2E test**

Add test:
1. Type unsent draft in one conversation.
2. Switch conversation.
3. Return and confirm draft is restored.

**Step 2: Run test to verify it fails**

Run: `pnpm test:e2e tests/e2e/conversation-sidebar.spec.ts`  
Expected: FAIL.

**Step 3: Write minimal implementation**

Maintain `draftByConversationId` map in component state and hydrate draft on active conversation change.

**Step 4: Run test to verify it passes**

Run: `pnpm test:e2e tests/e2e/conversation-sidebar.spec.ts`  
Expected: PASS.

### Task 5: Responsive Polish For Desktop/Tablet/Mobile

**Files:**
- Modify: `apps/web/src/styles.css`
- Test: `tests/e2e/fullscreen-toggle.spec.ts`

**Step 1: Write failing E2E assertions**

Add viewport-specific checks:
1. Desktop: history push layout works.
2. Tablet: history width ratio bounded.
3. Mobile: history opens as bottom sheet and composer remains visible.

**Step 2: Run test to verify it fails**

Run: `pnpm test:e2e tests/e2e/fullscreen-toggle.spec.ts`  
Expected: FAIL.

**Step 3: Write minimal implementation**

Add breakpoints and mobile bottom-sheet behavior.

**Step 4: Run test to verify it passes**

Run: `pnpm test:e2e tests/e2e/fullscreen-toggle.spec.ts`  
Expected: PASS.

### Task 6: Fix Browser Runtime Env Access Regression

**Files:**
- Modify: `apps/web/src/state/settings-store.ts`
- Test: `apps/web/src/state/settings-store.test.ts` (create if needed)

**Step 1: Write failing test**

Add test proving env resolver does not require `process` in browser runtime path.

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @geohelper/web test apps/web/src/state/settings-store.test.ts`  
Expected: FAIL.

**Step 3: Write minimal implementation**

Use `import.meta.env` guarded access only; avoid direct unguarded `process` reference in browser code.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @geohelper/web test apps/web/src/state/settings-store.test.ts`  
Expected: PASS.

### Task 7: Full Verification And Cleanup

**Files:**
- Modify: `tests/e2e/*.spec.ts` (as needed)
- Modify: `apps/web/src/**/*.ts(x)` (as needed)

**Step 1: Run focused suite**

Run:
1. `pnpm --filter @geohelper/web test`
2. `pnpm test:e2e tests/e2e/conversation-sidebar.spec.ts tests/e2e/chat-to-render.spec.ts tests/e2e/fullscreen-toggle.spec.ts`

Expected: PASS.

**Step 2: Run broad workspace checks**

Run:
1. `pnpm test`
2. `pnpm typecheck`

Expected: PASS or documented known failures unrelated to this feature.

**Step 3: Commit**

Commit with message similar to: `feat(web): redesign chat ui with slash composer and hidden-by-default history drawer`.
