# Composer Vision Upload + Settings Center Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver a ChatGPT-style image-capable composer and a NextChat-style modal settings center without regressing existing BYOK/Official chat flows.

**Architecture:** Keep the current stores and runtime pipeline as the foundation, then incrementally add capability resolution, structured composer draft state, multimodal request payloads, and a modalized settings shell with left-nav sections. Implement behavior in thin slices with focused tests first so text-only chat and existing settings persistence stay stable throughout the migration.

**Tech Stack:** React 19, Zustand, TypeScript, Vitest, Playwright, Vite CSS

---

### Task 1: Add Capability Resolver For Vision-Aware UI

**Files:**
- Modify: `apps/web/src/runtime/types.ts`
- Modify: `apps/web/src/state/settings-store.ts`
- Test: `apps/web/src/state/settings-store.test.ts`

**Step 1: Write the failing test**

Add tests that verify capability resolution returns:
1. `supportsVision=false` for direct runtime with ordinary text preset.
2. `supportsVision=true` when preset/model name indicates multimodal support.
3. Existing capability flags remain unchanged.

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @geohelper/web test -- --run src/state/settings-store.test.ts`
Expected: FAIL because `supportsVision` and resolver helpers do not exist.

**Step 3: Write minimal implementation**

Add:
1. `supportsVision` to runtime capability model.
2. A small resolver/helper in `settings-store` or adjacent code that derives active capabilities from runtime + selected model.
3. Conservative model-name heuristics for first release.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @geohelper/web test -- --run src/state/settings-store.test.ts`
Expected: PASS.

### Task 2: Extend Chat State For Image Attachments

**Files:**
- Modify: `apps/web/src/state/chat-store.ts`
- Test: `apps/web/src/state/chat-store.test.ts`

**Step 1: Write the failing test**

Add tests for:
1. User messages can include image attachments.
2. Attachment metadata persists in conversation state.
3. Text-only sends still work unchanged.

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @geohelper/web test -- --run src/state/chat-store.test.ts`
Expected: FAIL because message attachments are not modeled.

**Step 3: Write minimal implementation**

Add:
1. `ChatAttachment` and message attachment field.
2. Store send path that accepts structured message input.
3. Backward-compatible text-only behavior.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @geohelper/web test -- --run src/state/chat-store.test.ts`
Expected: PASS.

### Task 3: Build Modal Settings Center Shell

**Files:**
- Modify: `apps/web/src/components/SettingsDrawer.tsx`
- Modify: `apps/web/src/components/WorkspaceShell.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `tests/e2e/settings-drawer.spec.ts`

**Step 1: Write the failing test**

Add E2E coverage for:
1. Settings opens as centered modal instead of edge drawer.
2. Modal exposes section nav entries: `通用`, `模型与预设`, `当前会话`, `实验功能`, `数据与安全`.
3. Switching sections keeps modal open and shows correct content.

**Step 2: Run test to verify it fails**

Run: `pnpm test:e2e tests/e2e/settings-drawer.spec.ts`
Expected: FAIL because modal shell and section nav do not exist.

**Step 3: Write minimal implementation**

Implement:
1. Centered modal/backdrop shell.
2. Left-side section navigation.
3. Re-group current settings content into the validated section layout.

**Step 4: Run test to verify it passes**

Run: `pnpm test:e2e tests/e2e/settings-drawer.spec.ts`
Expected: PASS.

### Task 4: Move `+` Into Composer And Add Image Draft UI

**Files:**
- Modify: `apps/web/src/components/WorkspaceShell.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `tests/e2e/chat-to-render.spec.ts`

**Step 1: Write the failing test**

Add E2E coverage for:
1. `+` trigger is anchored inside the composer shell.
2. Upload action is visible in the `+` menu.
3. Selecting image files shows removable thumbnails before send.
4. Vision-unsupported mode disables image upload with a clear hint.

**Step 2: Run test to verify it fails**

Run: `pnpm test:e2e tests/e2e/chat-to-render.spec.ts`
Expected: FAIL because composer attachments UI does not exist.

**Step 3: Write minimal implementation**

Implement:
1. Structured draft state with `text` + `attachments` per conversation.
2. Hidden file input + `+` action menu.
3. Thumbnail tray, remove action, paste/drop handlers, and inline hint state.

**Step 4: Run test to verify it passes**

Run: `pnpm test:e2e tests/e2e/chat-to-render.spec.ts`
Expected: PASS.

### Task 5: Extend Runtime Requests For Multimodal Images

**Files:**
- Modify: `apps/web/src/runtime/types.ts`
- Modify: `apps/web/src/runtime/direct-client.ts`
- Modify: `apps/web/src/runtime/gateway-client.ts`
- Modify: `apps/web/src/runtime/runtime-service.ts`
- Test: `apps/web/src/runtime/direct-client.test.ts`
- Test: `apps/web/src/runtime/gateway-client.test.ts`

**Step 1: Write the failing test**

Add tests verifying:
1. Direct runtime sends OpenAI-compatible mixed text/image message content.
2. Gateway runtime forwards attachment payloads without dropping metadata.
3. Text-only requests remain unchanged.

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @geohelper/web test -- --run src/runtime/direct-client.test.ts src/runtime/gateway-client.test.ts`
Expected: FAIL because runtime requests are text-only.

**Step 3: Write minimal implementation**

Implement:
1. Runtime request attachment fields.
2. Direct client serialization to multimodal message content.
3. Gateway client passthrough of attachments.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @geohelper/web test -- --run src/runtime/direct-client.test.ts src/runtime/gateway-client.test.ts`
Expected: PASS.

### Task 6: Focused Verification And Cleanup

**Files:**
- Modify: `apps/web/src/**/*.ts(x)`
- Modify: `tests/e2e/*.spec.ts`

**Step 1: Run focused verification**

Run:
1. `pnpm --filter @geohelper/web test -- --run src/state/settings-store.test.ts src/state/chat-store.test.ts src/runtime/direct-client.test.ts src/runtime/gateway-client.test.ts`
2. `pnpm test:e2e tests/e2e/settings-drawer.spec.ts tests/e2e/chat-to-render.spec.ts`

Expected: PASS.

**Step 2: Run broader checks**

Run:
1. `pnpm --filter @geohelper/web test`
2. `pnpm --filter @geohelper/web build`

Expected: PASS or clearly documented unrelated failures.
