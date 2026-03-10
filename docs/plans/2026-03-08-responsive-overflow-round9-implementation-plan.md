# Responsive Overflow Round 9 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复移动端与短横屏下的三处响应式缺陷：聊天长 token 横向溢出、调试日志横向溢出、数据与安全分区在短横屏下被误套用双栏布局导致操作区可见性退化。

**Architecture:** 继续采用最小改动策略：先补端到端失败用例，再用局部 CSS 收紧换行与最小宽度约束，并通过给通用分区添加专用类名来收窄短横屏双栏规则的作用范围。避免改动状态流与设置抽屉结构，只修根因选择器与文本布局策略。

**Tech Stack:** React, TypeScript, Playwright, CSS

---

### Task 1: 长 token 聊天气泡回归

**Files:**
- Modify: `tests/e2e/fullscreen-toggle.spec.ts`
- Modify: `apps/web/src/styles.css`

**Step 1: Write the failing test**
- 在紧凑移动视口下注入超长无断点 assistant 文本。
- 断言 `.chat-message-assistant` 的 `scrollWidth <= clientWidth + 1`。

**Step 2: Run test to verify it fails**
- Run: `pnpm exec playwright test tests/e2e/fullscreen-toggle.spec.ts --grep "long assistant token wraps"`

**Step 3: Write minimal implementation**
- 为 `.chat-message` 及必要子节点补充 `overflow-wrap: anywhere`、`word-break: break-word`、`min-width: 0`。

**Step 4: Run test to verify it passes**
- Run: same as Step 2

### Task 2: 调试日志长 token 回归

**Files:**
- Modify: `tests/e2e/settings-drawer.spec.ts`
- Modify: `apps/web/src/styles.css`

**Step 1: Write the failing test**
- 在数据与安全分区注入超长 debug event。
- 断言 `.debug-log-panel` 没有横向溢出，日志行内容右边界不越过面板右边界。

**Step 2: Run test to verify it fails**
- Run: `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "debug log wraps"`

**Step 3: Write minimal implementation**
- 为 `.debug-log-panel article` 及子节点补充 `min-width: 0` 与长词换行规则。

**Step 4: Run test to verify it passes**
- Run: same as Step 2

### Task 3: 短横屏 data 分区布局选择器收窄

**Files:**
- Modify: `apps/web/src/components/SettingsDrawer.tsx`
- Modify: `tests/e2e/settings-drawer.spec.ts`
- Modify: `apps/web/src/styles.css`

**Step 1: Write the failing test**
- 在 `740x360` 视口打开数据与安全分区，导入备份后断言导入策略按钮在视口内且 `备份与恢复` section 不是双栏误布局。

**Step 2: Run test to verify it fails**
- Run: `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "short landscape data section"`

**Step 3: Write minimal implementation**
- 给通用分区添加 `settings-section-general` 类。
- 把短横屏双栏 CSS 从 `:first-child` 改为该专用类。

**Step 4: Run test to verify it passes**
- Run: same as Step 2

### Task 4: 回归验证与继续巡检

**Files:**
- Modify: `apps/web/src/styles.css`（如巡检发现同类问题）
- Modify: `tests/e2e/*.spec.ts`（如需补回归）

**Step 1: Run focused regression**
- Run: `pnpm exec playwright test tests/e2e/fullscreen-toggle.spec.ts tests/e2e/settings-drawer.spec.ts tests/e2e/geogebra-mount.spec.ts`

**Step 2: Run typecheck**
- Run: `pnpm typecheck`

**Step 3: Run web build**
- Run: `pnpm --filter @geohelper/web build`

**Step 4: Continue UI audit**
- Run audit tooling and inspect fresh screenshots/report for next round issues.
