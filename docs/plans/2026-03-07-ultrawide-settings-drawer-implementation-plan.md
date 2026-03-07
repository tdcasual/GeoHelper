# Ultrawide Settings Drawer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 提升超宽屏桌面下设置抽屉与正文列的可读宽度。

**Architecture:** 仅通过超宽屏 CSS 媒体查询重分配设置抽屉的宽度与两列 grid，不调整组件逻辑或表单结构。

**Tech Stack:** React 19, CSS, Playwright E2E

---

### Task 1: 先写失败测试

**Files:**
- Modify: `tests/e2e/fullscreen-toggle.spec.ts`

**Step 1: Write the failing test**
- 新增 `2560×1440` 设置抽屉宽度回归，要求 drawer 和 settings content 宽度达标。

**Step 2: Run test to verify it fails**
- `pnpm exec playwright test tests/e2e/fullscreen-toggle.spec.ts --grep "ultrawide settings drawer"`
- Expected: FAIL

### Task 2: 最小实现

**Files:**
- Modify: `apps/web/src/styles.css`

**Step 1: Add minimal implementation**
- 在超宽屏媒体查询下放宽 `.settings-drawer`。
- 同步调整 `.settings-modal-body` 的列宽和 gap。

**Step 2: Run targeted test**
- `pnpm exec playwright test tests/e2e/fullscreen-toggle.spec.ts --grep "ultrawide settings drawer"`
- Expected: PASS

### Task 3: 全量验证与提交

**Files:**
- Modify: `docs/plans/2026-03-07-ultrawide-settings-drawer-design.md`
- Modify: `docs/plans/2026-03-07-ultrawide-settings-drawer-implementation-plan.md`
- Modify: `apps/web/src/styles.css`
- Modify: `tests/e2e/fullscreen-toggle.spec.ts`

**Step 1: Run verification**
- `pnpm exec playwright test tests/e2e/geogebra-mount.spec.ts tests/e2e/fullscreen-toggle.spec.ts`
- `pnpm typecheck`
- `pnpm --filter @geohelper/web build`

**Step 2: Commit**
- `git add ...`
- `git commit -m "fix: widen ultrawide settings drawer"`
