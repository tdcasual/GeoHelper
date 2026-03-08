# Responsive Polish P0-P2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复桌面历史抽屉挤压正文、超宽屏聊天栏过窄、短横屏历史面板不协调，以及移动端空态缺少模板入口的问题。

**Architecture:** 维持现有 `WorkspaceShell + styles.css` 主体结构不变，只在桌面历史判定、超宽屏宽度规则、短横屏 history sheet 样式和 compact 空态渲染上做最小增量调整。所有改动先由 Playwright 回归测试锁定，再以最小实现通过。

**Tech Stack:** React 19, Zustand, CSS, Playwright E2E, TypeScript

---

### Task 1: 先补失败用例

**Files:**
- Modify: `tests/e2e/fullscreen-toggle.spec.ts`

**Step 1: Write the failing test**
- 增加 `1600×900` 桌面打开历史后聊天正文仍保持可用宽度的测试。
- 增加 `2560×1440` 超宽屏聊天栏/空态卡宽度更可读的测试。
- 增加 `844×390` 横屏 history sheet 更像完整模态层的测试。
- 增加 `390×844` compact 空态仍保留模板按钮的测试。

**Step 2: Run test to verify it fails**
- Run: `pnpm exec playwright test tests/e2e/fullscreen-toggle.spec.ts --grep "1600|ultrawide chat|history sheet|compact empty state"`
- Expected: 至少一个 FAIL，证明测试能抓到当前问题。

### Task 2: 修复桌面历史抽屉与超宽屏聊天栏

**Files:**
- Modify: `apps/web/src/components/WorkspaceShell.tsx`
- Modify: `apps/web/src/styles.css`

**Step 1: Add minimal implementation**
- 用“历史目标宽度 + 正文最小可用宽度”取代单纯的 `chatShellWidth <= 480` 判定。
- 在超宽屏媒体查询里放宽 `.chat-panel`，并同步放宽 `.chat-empty-card`。

**Step 2: Run targeted tests**
- Run: `pnpm exec playwright test tests/e2e/fullscreen-toggle.spec.ts --grep "history opens|ultrawide chat"`
- Expected: PASS

### Task 3: 修复短横屏历史面板与 compact 空态

**Files:**
- Modify: `apps/web/src/components/WorkspaceShell.tsx`
- Modify: `apps/web/src/styles.css`

**Step 1: Add minimal implementation**
- 为 `short-viewport + compact-viewport` 提供更高、更完整的 history sheet 规则。
- 为 compact 空态增加轻量模板按钮，并复用已有模板注入逻辑。

**Step 2: Run targeted tests**
- Run: `pnpm exec playwright test tests/e2e/fullscreen-toggle.spec.ts --grep "history sheet|compact empty state"`
- Expected: PASS

### Task 4: 完整验证

**Files:**
- Modify: `docs/plans/2026-03-08-responsive-polish-p0-p2-implementation-plan.md`
- Modify: `apps/web/src/components/WorkspaceShell.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `tests/e2e/fullscreen-toggle.spec.ts`

**Step 1: Run verification**
- Run: `pnpm exec playwright test tests/e2e/geogebra-mount.spec.ts tests/e2e/fullscreen-toggle.spec.ts`
- Run: `pnpm typecheck`
- Run: `pnpm --filter @geohelper/web build`

**Step 2: Commit**
- `git add ...`
- `git commit -m "fix: polish responsive layout edge cases"`
