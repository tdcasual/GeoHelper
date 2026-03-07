# Responsive Breakpoint Stabilization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复窄桌面历史挤压聊天区和低高度横屏顶部栏过高的问题。

**Architecture:** 保持现有桌面/compact 主结构不变，只在两个失效断面上追加更细粒度的布局规则：窄桌面历史改为聊天壳内覆盖层，低高度横屏增加 `short-viewport` 类来压缩头部。

**Tech Stack:** React 19, Zustand, CSS, Playwright E2E

---

### Task 1: 回归测试先红

**Files:**
- Modify: `tests/e2e/fullscreen-toggle.spec.ts`

**Step 1: Write the failing test**
- 增加 `901×600` 历史打开后聊天正文宽度保持可用的测试。
- 增加 `844×390` 顶部栏高度受控的测试。

**Step 2: Run test to verify it fails**
- Run: `pnpm exec playwright test tests/e2e/fullscreen-toggle.spec.ts --grep "near-breakpoint|landscape"`
- Expected: 至少一个 FAIL，证明测试能抓到当前线上/本地问题。

### Task 2: 窄桌面历史覆盖化

**Files:**
- Modify: `apps/web/src/components/WorkspaceShell.tsx`
- Modify: `apps/web/src/styles.css`

**Step 1: Add minimal implementation**
- 根据聊天壳宽度判断 `history-overlay-mode`。
- 在该模式下让桌面历史使用绝对定位覆盖层，而不是占据 flex 宽度。

**Step 2: Run narrow desktop test**
- Run: `pnpm exec playwright test tests/e2e/fullscreen-toggle.spec.ts --grep "near-breakpoint"`
- Expected: PASS

### Task 3: 低高度横屏压缩头部

**Files:**
- Modify: `apps/web/src/components/WorkspaceShell.tsx`
- Modify: `apps/web/src/styles.css`

**Step 1: Add minimal implementation**
- 增加 `short-viewport` 状态与 class。
- 缩小低高度 compact 顶部栏、按钮、切换器与 workspace padding。

**Step 2: Run landscape test**
- Run: `pnpm exec playwright test tests/e2e/fullscreen-toggle.spec.ts --grep "landscape top bar"`
- Expected: PASS

### Task 4: Full verification and commit

**Files:**
- Modify: `docs/plans/2026-03-07-responsive-breakpoint-stabilization-design.md`
- Modify: `docs/plans/2026-03-07-responsive-breakpoint-stabilization-implementation-plan.md`
- Modify: `apps/web/src/components/WorkspaceShell.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `tests/e2e/fullscreen-toggle.spec.ts`

**Step 1: Run verification**
- Run: `pnpm exec playwright test tests/e2e/geogebra-mount.spec.ts tests/e2e/fullscreen-toggle.spec.ts`
- Run: `pnpm typecheck`
- Run: `pnpm --filter @geohelper/web build`

**Step 2: Commit**
- `git add ...`
- `git commit -m "fix: stabilize responsive history and header layouts"`
