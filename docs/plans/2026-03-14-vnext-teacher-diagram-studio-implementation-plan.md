# GeoHelper VNext Teacher Diagram Studio Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把 GeoHelper 从“聊天驱动的几何工具”重构为“面向中学老师的题图制图台”，优先强化“看图/文字生成可编辑图形”的首页启动路径与三栏工作台。

**Architecture:** 保持现有 `WorkspaceShell + Zustand stores + GeoGebra runtime` 作为基础，不推翻运行时、备份、历史、会话与模板存储。第一阶段先重构信息架构与界面骨架，把聊天降级为输入子流程；第二阶段补结构化结果与确认流；第三阶段再把证明辅助、演示与导出接到同一工作链路里。所有变更都以可回归的 E2E 和小范围单元测试先行，避免在 UI 重构时打断现有 Direct/Gateway、历史、备份、图片输入能力。

**Tech Stack:** React 19, TypeScript, Zustand, Vitest, Playwright, Vite CSS

## Execution Status (2026-03-15)

Current branch: `codex/vnext-teacher-diagram-studio`

Completed in this branch:

1. Task 1–6: 启动页模型、首页骨架、三栏工作台、输入面板、结构化结果适配层、结构化结果组件。
2. Task 7: 教师模板库显式入口，支持从首页与输入 rail 进入并带入模板 prompt。
3. Task 8: 证明辅助动作 scaffold，支持结果后的 follow-up prompt dispatch。
4. Task 9: 制图台视觉 token 收束与相关视觉回归断言。
5. Task 10: focused + broader verification completed, including full Playwright regression.

Verification executed on 2026-03-15:

1. `pnpm --filter @geohelper/web test` ✅
2. `pnpm typecheck` ✅
3. `pnpm --filter @geohelper/web build` ✅
4. `pnpm exec playwright test` ✅

---

### Task 1: 固化 VNext 启动页数据模型

**Files:**
- Create: `apps/web/src/state/studio-start.ts`
- Test: `apps/web/src/state/studio-start.test.ts`

**Step 1: Write the failing test**

新增测试覆盖：
1. 首页主入口只暴露 `看图生成`、`文字生成`、`继续编辑` 三个启动动作。
2. 首页案例数据包含教师场景样例，且每个样例有 `title`、`summary`、`inputMode`、`seedPrompt`。
3. 文案不包含“开始聊天”等旧心智词汇。

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @geohelper/web test -- --run src/state/studio-start.test.ts`
Expected: FAIL because `studio-start.ts` does not exist.

**Step 3: Write minimal implementation**

在 `studio-start.ts` 导出：
1. `type StudioStartMode = "image" | "text" | "continue"`
2. `STUDIO_START_ACTIONS`
3. `TEACHER_SCENARIO_SEEDS`
4. 纯函数 helper：`resolveStudioStartCopy()`

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @geohelper/web test -- --run src/state/studio-start.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/state/studio-start.ts apps/web/src/state/studio-start.test.ts
git commit -m "feat: add vnext studio start model"
```

### Task 2: 先写首页启动页 E2E，再实现首页骨架

**Files:**
- Create: `tests/e2e/vnext-homepage.spec.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/components/WorkspaceShell.tsx`
- Modify: `apps/web/src/styles.css`

**Step 1: Write the failing test**

新增首页 E2E，覆盖：
1. 首屏出现标题“把题目变成可编辑几何图”。
2. 主输入区支持图片拖放提示、图片粘贴提示、文字题干输入入口。
3. 右侧出现教师案例区，并至少显示 3 个可点击案例。
4. 主按钮文案为“开始生成图形”，不出现“开始聊天”。

**Step 2: Run test to verify it fails**

Run: `pnpm exec playwright test tests/e2e/vnext-homepage.spec.ts`
Expected: FAIL because VNext homepage shell does not exist.

**Step 3: Write minimal implementation**

实现最小首页骨架：
1. 在 `App.tsx` 增加启动页与工作台入口切换。
2. 在 `WorkspaceShell.tsx` 顶部保留现有工作区逻辑，但增加“从启动页进入工作台”的受控入口。
3. 在 `styles.css` 添加启动页布局、案例条、主输入纸面样式。
4. 启动页按钮点击后仍进入现有工作区，不改变现有发送逻辑。

**Step 4: Run test to verify it passes**

Run: `pnpm exec playwright test tests/e2e/vnext-homepage.spec.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/e2e/vnext-homepage.spec.ts apps/web/src/App.tsx apps/web/src/components/WorkspaceShell.tsx apps/web/src/styles.css
git commit -m "feat: add vnext homepage shell"
```

### Task 3: 把工作台从聊天壳重排为三栏制图台

**Files:**
- Create: `tests/e2e/vnext-workspace-layout.spec.ts`
- Modify: `apps/web/src/components/WorkspaceShell.tsx`
- Modify: `apps/web/src/components/ChatPanel.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `tests/e2e/fullscreen-toggle.spec.ts`
- Test: `tests/e2e/conversation-sidebar.spec.ts`

**Step 1: Write the failing test**

新增/扩展 E2E 覆盖：
1. 桌面下工作台存在左栏输入区、中栏画布区、右栏结果区。
2. 画布区宽度仍是主优先区域。
3. 历史仍可打开，但其视觉位置退居输入侧辅助层，不再主导右栏。
4. 现有全屏与对话切换回归不应失效。

**Step 2: Run test to verify it fails**

Run: `pnpm exec playwright test tests/e2e/vnext-workspace-layout.spec.ts tests/e2e/fullscreen-toggle.spec.ts tests/e2e/conversation-sidebar.spec.ts`
Expected: FAIL because three-rail workspace does not exist.

**Step 3: Write minimal implementation**

最小重排：
1. 在 `WorkspaceShell.tsx` 中把现有聊天区拆成 `input rail` 与 `result rail` 的语义区块。
2. `ChatPanel.tsx` 退化为更通用的 rail 容器，避免命名继续强化“聊天主导”。
3. `styles.css` 改为桌面三栏栅格，compact/mobile 先保留已有两态逻辑并做兼容映射。
4. 保持 GeoGebra 挂载、全屏、历史 drawer、composer 原功能不回归。

**Step 4: Run test to verify it passes**

Run: `pnpm exec playwright test tests/e2e/vnext-workspace-layout.spec.ts tests/e2e/fullscreen-toggle.spec.ts tests/e2e/conversation-sidebar.spec.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/e2e/vnext-workspace-layout.spec.ts tests/e2e/fullscreen-toggle.spec.ts tests/e2e/conversation-sidebar.spec.ts apps/web/src/components/WorkspaceShell.tsx apps/web/src/components/ChatPanel.tsx apps/web/src/styles.css
git commit -m "feat: reshape workspace into three-rail studio"
```

### Task 4: 抽出左栏输入面板并显式化三种输入模式

**Files:**
- Create: `apps/web/src/components/StudioInputPanel.tsx`
- Create: `tests/e2e/studio-input-panel.spec.ts`
- Modify: `apps/web/src/components/WorkspaceShell.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `tests/e2e/chat-to-render.spec.ts`

**Step 1: Write the failing test**

新增 E2E 覆盖：
1. 左栏出现 `看图生成`、`文字生成`、`继续补图` 三种模式切换。
2. `看图生成` 模式下显示图片上传/粘贴/拖拽提示。
3. `文字生成` 模式下显示题干输入区域。
4. 原 composer 文本发送、图片缩略图、slash 模板仍能工作。

**Step 2: Run test to verify it fails**

Run: `pnpm exec playwright test tests/e2e/studio-input-panel.spec.ts tests/e2e/chat-to-render.spec.ts`
Expected: FAIL because dedicated studio input panel does not exist.

**Step 3: Write minimal implementation**

实现：
1. 新建 `StudioInputPanel.tsx` 承接模式切换与输入框层次。
2. 把现有 composer、图片输入、模板快捷入口嵌入该组件，而不是散落在右栏。
3. `WorkspaceShell.tsx` 只保留状态编排与 action wiring。
4. 使用最少的新状态，复用现有 draft、attachments、templates、conversation history。

**Step 4: Run test to verify it passes**

Run: `pnpm exec playwright test tests/e2e/studio-input-panel.spec.ts tests/e2e/chat-to-render.spec.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/components/StudioInputPanel.tsx tests/e2e/studio-input-panel.spec.ts apps/web/src/components/WorkspaceShell.tsx apps/web/src/styles.css tests/e2e/chat-to-render.spec.ts
git commit -m "feat: extract studio input panel"
```

### Task 5: 建立结构化结果面板的数据适配层

**Files:**
- Create: `apps/web/src/components/studio-result-panel.ts`
- Test: `apps/web/src/components/studio-result-panel.test.ts`
- Modify: `apps/web/src/state/chat-store.ts`
- Modify: `apps/web/src/state/chat-store.test.ts`

**Step 1: Write the failing test**

新增单元测试覆盖：
1. assistant message 可被映射为 `图形摘要`、`执行步骤`、`不确定项`、`下一步动作`。
2. 当 `agentSteps` 存在时，可生成人类可读的步骤列表。
3. 无结构数据时，结果面板优雅降级为普通文本结果。

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @geohelper/web test -- --run src/components/studio-result-panel.test.ts src/state/chat-store.test.ts`
Expected: FAIL because result-panel adapter does not exist.

**Step 3: Write minimal implementation**

实现：
1. 新建纯函数 adapter，把当前 message / agentSteps 转换为 studio result view model。
2. 在 `chat-store.ts` 中补足结果面板所需的最小字段，避免直接在组件内硬解析消息。
3. 不改变 runtime 协议；当前阶段优先做前端适配层。

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @geohelper/web test -- --run src/components/studio-result-panel.test.ts src/state/chat-store.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/components/studio-result-panel.ts apps/web/src/components/studio-result-panel.test.ts apps/web/src/state/chat-store.ts apps/web/src/state/chat-store.test.ts
git commit -m "feat: add structured result adapter"
```

### Task 6: 先写结果面板 E2E，再把右栏从消息流升级为结构化结果区

**Files:**
- Create: `apps/web/src/components/StudioResultPanel.tsx`
- Create: `tests/e2e/studio-result-panel.spec.ts`
- Modify: `apps/web/src/components/WorkspaceShell.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `tests/e2e/chat-to-render.spec.ts`

**Step 1: Write the failing test**

新增 E2E 覆盖：
1. 发送后右栏显示 `图形摘要`、`执行步骤`、`下一步动作` 标题。
2. 右栏保留最新结果，消息流不再是唯一查看结果的方式。
3. 点击“补辅助线”或“生成讲解思路”时，先触发占位动作而非直接沉默失败。

**Step 2: Run test to verify it fails**

Run: `pnpm exec playwright test tests/e2e/studio-result-panel.spec.ts tests/e2e/chat-to-render.spec.ts`
Expected: FAIL because structured result panel is not rendered.

**Step 3: Write minimal implementation**

实现：
1. 新建 `StudioResultPanel.tsx`，消费 Task 5 的 view model。
2. `WorkspaceShell.tsx` 把结果区与旧消息流解耦：消息流可保留在输入侧或折叠区，右栏显示结构化结果。
3. “下一步动作”先使用 stubbed action hooks，后续任务再接证明辅助与导出。

**Step 4: Run test to verify it passes**

Run: `pnpm exec playwright test tests/e2e/studio-result-panel.spec.ts tests/e2e/chat-to-render.spec.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/components/StudioResultPanel.tsx tests/e2e/studio-result-panel.spec.ts apps/web/src/components/WorkspaceShell.tsx apps/web/src/styles.css tests/e2e/chat-to-render.spec.ts
git commit -m "feat: add structured result rail"
```

### Task 7: 把教师模板库从隐式模板列表升级为显式资源入口

**Files:**
- Create: `apps/web/src/components/TeacherTemplateLibrary.tsx`
- Create: `tests/e2e/teacher-template-library.spec.ts`
- Modify: `apps/web/src/state/template-store.ts`
- Modify: `apps/web/src/state/template-store.test.ts`
- Modify: `apps/web/src/components/WorkspaceShell.tsx`
- Modify: `apps/web/src/styles.css`

**Step 1: Write the failing test**

新增测试覆盖：
1. 模板可按教师场景分类展示，而非只是一维标题列表。
2. 首页与左栏都可进入模板库。
3. 点击模板后能把 prompt/seed action 写入当前输入区。

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @geohelper/web test -- --run src/state/template-store.test.ts && pnpm exec playwright test tests/e2e/teacher-template-library.spec.ts`
Expected: FAIL because categorized teacher template library does not exist.

**Step 3: Write minimal implementation**

实现：
1. 给默认模板补充教师场景分类与展示元数据。
2. 新建 `TeacherTemplateLibrary.tsx`，支持分类浏览和“立即起稿”。
3. 把模板库从 `+` 菜单次级入口提升为显式资源入口。

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @geohelper/web test -- --run src/state/template-store.test.ts && pnpm exec playwright test tests/e2e/teacher-template-library.spec.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/components/TeacherTemplateLibrary.tsx tests/e2e/teacher-template-library.spec.ts apps/web/src/state/template-store.ts apps/web/src/state/template-store.test.ts apps/web/src/components/WorkspaceShell.tsx apps/web/src/styles.css
git commit -m "feat: add teacher template library"
```

### Task 8: 接入“补辅助线 / 讲解思路”占位能力，预留证明辅助落点

**Files:**
- Create: `apps/web/src/components/proof-assist-actions.ts`
- Test: `apps/web/src/components/proof-assist-actions.test.ts`
- Modify: `apps/web/src/components/StudioResultPanel.tsx`
- Modify: `apps/web/src/state/chat-store.ts`
- Modify: `apps/web/src/state/chat-store.test.ts`

**Step 1: Write the failing test**

新增测试覆盖：
1. 结果面板动作区可根据当前消息上下文生成 `补辅助线`、`生成讲解思路`、`尝试证明`。
2. 点击动作后会生成明确的后续 prompt/action，而不是直接修改图形。
3. 未满足上下文时动作自动禁用。

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @geohelper/web test -- --run src/components/proof-assist-actions.test.ts src/state/chat-store.test.ts`
Expected: FAIL because proof assist action helper does not exist.

**Step 3: Write minimal implementation**

实现：
1. 新建纯函数 helper，基于当前结果摘要返回推荐后续动作。
2. 在 `chat-store.ts` 中补一个最小 action dispatch path，把这些动作转成后续用户请求。
3. 暂不接复杂证明引擎，只保证链路成立。

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @geohelper/web test -- --run src/components/proof-assist-actions.test.ts src/state/chat-store.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/components/proof-assist-actions.ts apps/web/src/components/proof-assist-actions.test.ts apps/web/src/components/StudioResultPanel.tsx apps/web/src/state/chat-store.ts apps/web/src/state/chat-store.test.ts
git commit -m "feat: scaffold proof assist actions"
```

### Task 9: 统一视觉系统 token，并把旧浅蓝 SaaS 风格收束为制图台语义

**Files:**
- Modify: `apps/web/src/styles.css`
- Test: `tests/e2e/vnext-homepage.spec.ts`
- Test: `tests/e2e/vnext-workspace-layout.spec.ts`
- Test: `tests/e2e/studio-result-panel.spec.ts`

**Step 1: Write/update the failing visual assertions**

补视觉回归断言：
1. 首页主区和案例区在桌面视口为非对称布局。
2. 工作台背景、rail 边界、主标题样式不再依赖旧通用浅蓝按钮体系。
3. 结果区和输入区视觉层级清晰，画布仍是主角。

**Step 2: Run tests to verify they fail**

Run: `pnpm exec playwright test tests/e2e/vnext-homepage.spec.ts tests/e2e/vnext-workspace-layout.spec.ts tests/e2e/studio-result-panel.spec.ts`
Expected: FAIL until style tokens and layout polish land.

**Step 3: Write minimal implementation**

在 `styles.css` 中：
1. 提取 studio token：纸面底色、石墨文本、结构强调色、关键警示色。
2. 收束圆角、边界、阴影与留白节奏。
3. 让输入区更像工作纸、案例区更像参考条、左右 rail 更像工具抽屉。

**Step 4: Run tests to verify they pass**

Run: `pnpm exec playwright test tests/e2e/vnext-homepage.spec.ts tests/e2e/vnext-workspace-layout.spec.ts tests/e2e/studio-result-panel.spec.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/styles.css tests/e2e/vnext-homepage.spec.ts tests/e2e/vnext-workspace-layout.spec.ts tests/e2e/studio-result-panel.spec.ts
git commit -m "style: establish teacher studio visual system"
```

### Task 10: 全量验证、文档同步与发布前收口

**Files:**
- Modify: `docs/plans/2026-03-14-vnext-teacher-diagram-studio-design.md`
- Modify: `docs/plans/2026-03-14-vnext-teacher-diagram-studio-implementation-plan.md`
- Modify: `docs/plans/README.md`

**Step 1: Run focused verification**

Run:
1. `pnpm --filter @geohelper/web test -- --run src/state/studio-start.test.ts src/state/template-store.test.ts src/state/chat-store.test.ts src/components/studio-result-panel.test.ts src/components/proof-assist-actions.test.ts`
2. `pnpm exec playwright test tests/e2e/vnext-homepage.spec.ts tests/e2e/vnext-workspace-layout.spec.ts tests/e2e/studio-input-panel.spec.ts tests/e2e/studio-result-panel.spec.ts tests/e2e/teacher-template-library.spec.ts`

Expected: PASS.

**Step 2: Run broader regression**

Run:
1. `pnpm --filter @geohelper/web test`
2. `pnpm exec playwright test`
3. `pnpm typecheck`
4. `pnpm --filter @geohelper/web build`

Expected: PASS or clearly documented unrelated failures.

**Step 3: Sync docs**

更新：
1. 设计文档中的已完成状态或细节偏差。
2. `docs/plans/README.md` 中的最新状态。

**Step 4: Commit**

```bash
git add docs/plans/2026-03-14-vnext-teacher-diagram-studio-design.md docs/plans/2026-03-14-vnext-teacher-diagram-studio-implementation-plan.md docs/plans/README.md apps/web/src tests/e2e
git commit -m "feat: deliver vnext teacher diagram studio"
```
