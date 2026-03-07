# Desktop Empty State Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让桌面空会话的聊天区从“顶部一行提示”升级为居中引导卡片，并提供快捷模板按钮。

**Architecture:** 保持现有 chat messages / composer 结构，仅在 `messages.length === 0` 且非 compact 时渲染 richer empty state。模板按钮直接复用现有 draft 填充与 focus 流程，不引入新状态。

**Tech Stack:** React 19, Zustand template store, CSS, Playwright E2E

---

### Task 1: 先写失败测试

**Files:**
- Modify: `tests/e2e/fullscreen-toggle.spec.ts`

**Step 1: Write the failing test**
- 新增超宽屏桌面空态卡片与快捷模板的回归。

**Step 2: Run test to verify it fails**
- `pnpm exec playwright test tests/e2e/fullscreen-toggle.spec.ts --grep "desktop empty state"`
- Expected: FAIL

### Task 2: 最小实现

**Files:**
- Modify: `apps/web/src/components/WorkspaceShell.tsx`
- Modify: `apps/web/src/styles.css`

**Step 1: Add minimal implementation**
- 在桌面空态渲染居中卡片与前 3 个模板快捷按钮。
- 复用现有模板填充 draft + focus 行为。

**Step 2: Run targeted test**
- `pnpm exec playwright test tests/e2e/fullscreen-toggle.spec.ts --grep "desktop empty state"`
- Expected: PASS

### Task 3: 全量验证与提交

**Files:**
- Modify: `docs/plans/2026-03-07-desktop-empty-state-design.md`
- Modify: `docs/plans/2026-03-07-desktop-empty-state-implementation-plan.md`
- Modify: `apps/web/src/components/WorkspaceShell.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `tests/e2e/fullscreen-toggle.spec.ts`

**Step 1: Run verification**
- `pnpm exec playwright test tests/e2e/geogebra-mount.spec.ts tests/e2e/fullscreen-toggle.spec.ts`
- `pnpm typecheck`
- `pnpm --filter @geohelper/web build`

**Step 2: Commit**
- `git add ...`
- `git commit -m "fix: enrich desktop empty state"`
