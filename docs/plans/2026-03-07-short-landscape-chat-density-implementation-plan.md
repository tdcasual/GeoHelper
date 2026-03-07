# Short Landscape Chat Density Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让低高度横屏聊天 surface 中的消息区不再被过高的 composer 挤压。

**Architecture:** 保持现有组件结构不变，只通过更细粒度的 short-landscape CSS 规则压缩 composer、hint 和 slash menu。这样不改变业务逻辑，不影响桌面与普通手机竖屏。

**Tech Stack:** React 19, CSS, Playwright E2E

---

### Task 1: 先写失败测试

**Files:**
- Modify: `tests/e2e/fullscreen-toggle.spec.ts`

**Step 1: Write the failing test**
- 新增 `844×390` 聊天 surface 下消息区高度和 composer 高度的回归。

**Step 2: Run test to verify it fails**
- Run: `pnpm exec playwright test tests/e2e/fullscreen-toggle.spec.ts --grep "short landscape chat"`
- Expected: FAIL

### Task 2: 最小实现

**Files:**
- Modify: `apps/web/src/styles.css`

**Step 1: Add minimal implementation**
- 在 `short-viewport + compact-viewport + mobile-surface-chat` 下压缩 chat composer。
- 调整 `hint`、`input shell`、`textarea`、`send button`、`plus button`、`slash menu`。

**Step 2: Run test to verify it passes**
- Run: `pnpm exec playwright test tests/e2e/fullscreen-toggle.spec.ts --grep "short landscape chat"`
- Expected: PASS

### Task 3: 全量验证与提交

**Files:**
- Modify: `docs/plans/2026-03-07-short-landscape-chat-density-design.md`
- Modify: `docs/plans/2026-03-07-short-landscape-chat-density-implementation-plan.md`
- Modify: `apps/web/src/styles.css`
- Modify: `tests/e2e/fullscreen-toggle.spec.ts`

**Step 1: Run verification**
- `pnpm exec playwright test tests/e2e/geogebra-mount.spec.ts tests/e2e/fullscreen-toggle.spec.ts`
- `pnpm typecheck`
- `pnpm --filter @geohelper/web build`

**Step 2: Commit**
- `git add ...`
- `git commit -m "fix: compress short landscape chat composer"`
