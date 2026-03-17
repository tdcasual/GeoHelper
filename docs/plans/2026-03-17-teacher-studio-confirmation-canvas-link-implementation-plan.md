# GeoHelper Teacher Studio Confirmation Loop and Canvas Linking Implementation Plan

Status: Implemented on `main` through Task 6 on 2026-03-17

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把当前 teacher studio 的“待确认”从被动展示升级为可确认、可修正、可重试、可定位到画布的老师审阅闭环。

**Architecture:** 保持现有 `local-first` 的浏览器状态模型，不新增后端能力，也不改变 Gateway 的 snapshot-based 边界。实现方式是继续沿用当前的结构化 `ChatStudioResult`，在浏览器侧补上 `review status + canvas links + focus request` 三层契约：结果 contract 负责表达“哪些项待确认、现在确认到哪一步”，画布 focus store 负责表达“当前应该定位哪个对象”，结果面板与 `WorkspaceShell` 负责把这两套状态连起来，并在 compact/mobile 下保持同一条工作流。

**Tech Stack:** React 19, TypeScript, Zustand, Vitest, Playwright, existing GeoGebra adapter/runtime bridge, existing `WorkspaceShell` / `chat-store` / `scene-store`

---

## Scope

本计划只覆盖产品总纲中的两条前台主线：

1. `Track A: Teacher Studio Workflow Completion`
2. `Track B: Generation Reliability and Reviewability`

本计划明确不做：

1. backend / protocol 扩张，不增加 SQL、OLTP、server-authoritative state
2. message-level cloud sync、自动云端恢复、自动 pull / merge
3. 多租户、用户系统、权限、billing、admin console
4. 实时协作、presence、多端同步合并
5. 依赖服务端几何对象标注的新接口；对象联动只允许做浏览器侧 best-effort 推导与聚焦

---

### Task 1: 扩展结构化结果契约以承载确认状态与画布联动元数据

**Files:**
- Modify: `apps/web/src/state/chat-result.ts`
- Modify: `apps/web/src/state/chat-result.test.ts`
- Modify: `apps/web/src/state/chat-persistence.ts`
- Modify: `apps/web/src/state/chat-persistence.test.ts`
- Modify: `apps/web/src/state/chat-store-helpers.test.ts`
- Modify: `apps/web/src/state/chat-store.ts`

**Step 1: Write the failing tests**

补测试覆盖以下场景：

1. `uncertaintyItems` 在旧快照恢复时默认带上 `reviewStatus: "pending"`
2. 结果 contract 能持久化 `canvasLinks`
3. 非法或不完整的 `canvasLinks` 会在 normalize 时被安全裁剪，不破坏旧消息恢复

目标 contract 形态：

```ts
export interface ChatStudioCanvasLink {
  id: string;
  scope: "summary" | "warning" | "uncertainty";
  text: string;
  objectLabels: string[];
  uncertaintyId?: string;
}

export interface ChatStudioUncertaintyItem {
  id: string;
  label: string;
  followUpPrompt: string;
  reviewStatus: "pending" | "confirmed" | "needs_fix";
}
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @geohelper/web test -- --run src/state/chat-result.test.ts src/state/chat-persistence.test.ts src/state/chat-store-helpers.test.ts`
Expected: FAIL because the new review state and `canvasLinks` fields do not exist yet.

**Step 3: Write minimal implementation**

实现：

1. 在 `chat-result.ts` 中新增 `ChatStudioCanvasLink` 和 `reviewStatus` 归一化逻辑
2. 旧快照恢复时，自动把缺失的确认状态回填为 `pending`
3. `chat-persistence.ts` 与 `chat-store.ts` 保持向后兼容，不让老消息因为新字段缺失而报废

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter @geohelper/web test -- --run src/state/chat-result.test.ts src/state/chat-persistence.test.ts src/state/chat-store-helpers.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/state/chat-result.ts apps/web/src/state/chat-result.test.ts apps/web/src/state/chat-persistence.ts apps/web/src/state/chat-persistence.test.ts apps/web/src/state/chat-store-helpers.test.ts apps/web/src/state/chat-store.ts
git commit -m "feat: extend studio result contract for review state"
```

### Task 2: 增加浏览器内结果到画布的 focus/highlight 通道

**Files:**
- Create: `apps/web/src/state/scene-focus-store.ts`
- Create: `apps/web/src/state/scene-focus-store.test.ts`
- Modify: `apps/web/src/geogebra/adapter.ts`
- Modify: `apps/web/src/components/canvas-panel/runtime.ts`
- Modify: `apps/web/src/components/canvas-panel/scene-sync.ts`
- Modify: `apps/web/src/components/canvas-panel/scene-sync.test.ts`
- Modify: `apps/web/src/components/CanvasPanel.tsx`
- Modify: `tests/e2e/geogebra-mount.spec.ts`

**Step 1: Write the failing tests**

新增或扩展覆盖：

1. `scene-focus-store` 能发出一次性的 focus request，并在消费或超时后清空
2. `CanvasPanel` 收到 focus request 时会调用 GeoGebra runtime bridge，而不是直接耦合到结果面板
3. GeoGebra adapter 在缺少高亮能力时仍然安全 no-op，不影响现有绘图与回放

建议的最小 request 形态：

```ts
{
  requestId: string;
  source: "summary" | "uncertainty";
  objectLabels: ["A", "B", "C"];
  revealCanvas: boolean;
}
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @geohelper/web test -- --run src/state/scene-focus-store.test.ts src/components/canvas-panel/scene-sync.test.ts`
Expected: FAIL because the focus store and bridge do not exist yet.

**Step 3: Write minimal implementation**

实现：

1. 新建 `scene-focus-store.ts`，只负责当前聚焦请求，不把它塞进 `scene-store`
2. 扩展 `GeoGebraAdapter` 为“best-effort focus bridge”，例如 `focusObjects(objectLabels)` / `clearFocusedObjects()`
3. `CanvasPanel.tsx` 订阅 focus store，在 runtime ready 后执行一次聚焦，并在安全时机清理
4. 所有高亮逻辑必须是浏览器侧临时效果，不能写回 scene snapshot

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter @geohelper/web test -- --run src/state/scene-focus-store.test.ts src/components/canvas-panel/scene-sync.test.ts`
Run: `pnpm exec playwright test tests/e2e/geogebra-mount.spec.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/state/scene-focus-store.ts apps/web/src/state/scene-focus-store.test.ts apps/web/src/geogebra/adapter.ts apps/web/src/components/canvas-panel/runtime.ts apps/web/src/components/canvas-panel/scene-sync.ts apps/web/src/components/canvas-panel/scene-sync.test.ts apps/web/src/components/CanvasPanel.tsx tests/e2e/geogebra-mount.spec.ts
git commit -m "feat: add browser-side canvas focus bridge"
```

### Task 3: 从编译结果中推导可定位对象与针对性修正提示

**Files:**
- Create: `apps/web/src/state/chat-result-linking.ts`
- Create: `apps/web/src/state/chat-result-linking.test.ts`
- Modify: `apps/web/src/state/chat-send-flow.ts`
- Modify: `apps/web/src/state/chat-send-flow.test.ts`
- Modify: `apps/web/src/components/proof-assist-actions.ts`
- Modify: `apps/web/src/components/proof-assist-actions.test.ts`

**Step 1: Write the failing tests**

新增覆盖：

1. 从 `已创建三角形 ABC`、`点 D 在线段 BC 上`、`已作角平分线 AD` 这类结果文案里提取可用于画布聚焦的对象标签
2. `uncertaintyItems` 自动生成 `canvasLinks`
3. “需要修正”动作使用当前 uncertainty 的专属 `followUpPrompt`，而不是把所有待确认条件拼在一起

示例目标：

```ts
expect(result.canvasLinks).toContainEqual(
  expect.objectContaining({
    scope: "uncertainty",
    uncertaintyId: "unc_d",
    objectLabels: ["D", "B", "C"]
  })
);
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @geohelper/web test -- --run src/state/chat-result-linking.test.ts src/state/chat-send-flow.test.ts src/components/proof-assist-actions.test.ts`
Expected: FAIL because compile flow currently only产出文本摘要和通用 follow-up prompt。

**Step 3: Write minimal implementation**

实现：

1. 把文本到对象标签的启发式解析独立到 `chat-result-linking.ts`
2. 先覆盖常见 teacher studio 表达：
   - `点 A`
   - `线段 BC` / `射线 AD` / `直线 l`
   - `三角形 ABC`
   - `圆 O`
3. `chat-send-flow.ts` 在构建 assistant message 时填充 `canvasLinks`
4. `proof-assist-actions.ts` 新增“按单条 uncertainty 生成修正 prompt”的 helper，避免继续依赖拼接字符串

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter @geohelper/web test -- --run src/state/chat-result-linking.test.ts src/state/chat-send-flow.test.ts src/components/proof-assist-actions.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/state/chat-result-linking.ts apps/web/src/state/chat-result-linking.test.ts apps/web/src/state/chat-send-flow.ts apps/web/src/state/chat-send-flow.test.ts apps/web/src/components/proof-assist-actions.ts apps/web/src/components/proof-assist-actions.test.ts
git commit -m "feat: derive canvas links from studio results"
```

### Task 4: 把“待确认”升级为确认 / 修正 / 重试的老师审阅闭环

**Files:**
- Modify: `apps/web/src/state/chat-store.ts`
- Modify: `apps/web/src/state/chat-store-actions.ts`
- Modify: `apps/web/src/state/chat-store-actions.test.ts`
- Modify: `apps/web/src/components/studio-result-panel.ts`
- Modify: `apps/web/src/components/studio-result-panel.test.ts`
- Modify: `apps/web/src/components/StudioResultPanel.tsx`
- Modify: `apps/web/src/components/WorkspaceShell.tsx`
- Modify: `apps/web/src/components/workspace-shell/useWorkspaceComposer.ts`
- Modify: `tests/e2e/studio-review-flow.spec.ts`

**Step 1: Write the failing tests**

补测试覆盖：

1. 点击“确认无误”后，当前 uncertainty 从 `pending` 变为 `confirmed`
2. 点击“需要修正”后，既更新 `reviewStatus`，也通过现有 send flow 发出该条目的修正 prompt
3. 点击“重试本项”或“重新检查”时，不会覆盖其他已确认项
4. `StudioResultPanel` 能显示 `已确认 / 待处理 / 需修正` 数量，而不是只有一组原始列表

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @geohelper/web test -- --run src/state/chat-store-actions.test.ts src/components/studio-result-panel.test.ts`
Run: `pnpm exec playwright test tests/e2e/studio-review-flow.spec.ts`
Expected: FAIL because the current panel only renders passive uncertainty text.

**Step 3: Write minimal implementation**

实现：

1. 在 `chat-store` / `chat-store-actions` 中新增针对 assistant result 的局部更新 action
2. `StudioResultPanel.tsx` 为每条 uncertainty 增加：
   - `定位到画布`
   - `确认无误`
   - `需要修正`
3. `studio-result-panel.ts` 输出 review summary 和按钮禁用规则
4. `useWorkspaceComposer.ts` 暴露“按 uncertainty 发修正 prompt”的入口，继续复用现有会话与发送能力

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter @geohelper/web test -- --run src/state/chat-store-actions.test.ts src/components/studio-result-panel.test.ts`
Run: `pnpm exec playwright test tests/e2e/studio-review-flow.spec.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/state/chat-store.ts apps/web/src/state/chat-store-actions.ts apps/web/src/state/chat-store-actions.test.ts apps/web/src/components/studio-result-panel.ts apps/web/src/components/studio-result-panel.test.ts apps/web/src/components/StudioResultPanel.tsx apps/web/src/components/WorkspaceShell.tsx apps/web/src/components/workspace-shell/useWorkspaceComposer.ts tests/e2e/studio-review-flow.spec.ts
git commit -m "feat: add teacher review confirmation loop"
```

### Task 5: 把结果项与画布定位体验接入桌面与 compact/mobile 布局

**Files:**
- Modify: `apps/web/src/components/workspace-shell/WorkspaceDesktopLayout.tsx`
- Modify: `apps/web/src/components/workspace-shell/WorkspaceCompactLayout.tsx`
- Modify: `apps/web/src/components/workspace-shell/layout-props.ts`
- Modify: `apps/web/src/components/workspace-shell/WorkspaceChatMessages.tsx`
- Modify: `apps/web/src/styles/workspace-shell.css`
- Modify: `tests/e2e/studio-result-panel.spec.ts`
- Modify: `tests/e2e/studio-review-flow.spec.ts`
- Create: `tests/e2e/studio-canvas-link.spec.ts`

**Step 1: Write the failing tests**

新增或扩展覆盖：

1. desktop 下点击结果项的“定位到画布”后，画布收到 focus request，结果项进入 active 状态
2. compact/mobile 下从聊天面点击“定位到画布”时，会切到 canvas surface 或至少提示已定位对象
3. 来回切换 surface 后，最近一次 focus 状态会在合理时间内保留，不丢失老师当前检查上下文
4. chat thread 中 assistant 文本退化为回执，不与右侧结果 rail 争主视觉

**Step 2: Run tests to verify they fail**

Run: `pnpm exec playwright test tests/e2e/studio-result-panel.spec.ts tests/e2e/studio-review-flow.spec.ts tests/e2e/studio-canvas-link.spec.ts`
Expected: FAIL because layout层还没有接通 review action 和 canvas focus。

**Step 3: Write minimal implementation**

实现：

1. `WorkspaceShell.tsx` 统一持有结果动作与 focus request 的回调
2. desktop / compact layout 都使用同一套 `StudioResultPanel` action props，避免分叉逻辑
3. compact/mobile 优先保证“可达性”：
   - 从 chat surface 发起定位时，切换到 canvas surface
   - 保留一个轻量定位提示，告诉老师当前正在检查哪些对象
4. `WorkspaceChatMessages.tsx` 把 assistant 结构化结果文本降级为简短回执，避免与结果 rail 重复
5. `workspace-shell.css` 为 active review item、confirmed state、needs-fix state、canvas focus notice 补充样式

**Step 4: Run tests to verify they pass**

Run: `pnpm exec playwright test tests/e2e/studio-result-panel.spec.ts tests/e2e/studio-review-flow.spec.ts tests/e2e/studio-canvas-link.spec.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/components/workspace-shell/WorkspaceDesktopLayout.tsx apps/web/src/components/workspace-shell/WorkspaceCompactLayout.tsx apps/web/src/components/workspace-shell/layout-props.ts apps/web/src/components/workspace-shell/WorkspaceChatMessages.tsx apps/web/src/styles/workspace-shell.css tests/e2e/studio-result-panel.spec.ts tests/e2e/studio-review-flow.spec.ts tests/e2e/studio-canvas-link.spec.ts
git commit -m "feat: connect studio review items with canvas focus"
```

### Task 6: 全量验证并锁定这一阶段的浏览器端闭环

**Files:**
- Verify only: `apps/web/src/state/chat-result.ts`
- Verify only: `apps/web/src/state/chat-send-flow.ts`
- Verify only: `apps/web/src/state/scene-focus-store.ts`
- Verify only: `apps/web/src/components/StudioResultPanel.tsx`
- Verify only: `apps/web/src/components/CanvasPanel.tsx`
- Verify only: `tests/e2e/studio-result-panel.spec.ts`
- Verify only: `tests/e2e/studio-review-flow.spec.ts`
- Verify only: `tests/e2e/studio-canvas-link.spec.ts`
- Verify only: `tests/e2e/geogebra-mount.spec.ts`

**Step 1: Run the focused unit and E2E suites**

Run: `pnpm --filter @geohelper/web test -- --run src/state/chat-result.test.ts src/state/chat-result-linking.test.ts src/state/chat-send-flow.test.ts src/state/chat-store-actions.test.ts src/state/scene-focus-store.test.ts src/components/studio-result-panel.test.ts src/components/proof-assist-actions.test.ts src/components/canvas-panel/scene-sync.test.ts`
Run: `pnpm exec playwright test tests/e2e/studio-result-panel.spec.ts tests/e2e/studio-review-flow.spec.ts tests/e2e/studio-canvas-link.spec.ts tests/e2e/geogebra-mount.spec.ts`
Expected: PASS.

**Step 2: Run broader regression checks**

Run: `pnpm --filter @geohelper/web test`
Run: `pnpm typecheck`
Run: `pnpm --filter @geohelper/web build`
Expected: PASS.

**Step 3: Commit**

```bash
git add apps/web/src/state/chat-result.ts apps/web/src/state/chat-send-flow.ts apps/web/src/state/scene-focus-store.ts apps/web/src/components/StudioResultPanel.tsx apps/web/src/components/CanvasPanel.tsx tests/e2e/studio-result-panel.spec.ts tests/e2e/studio-review-flow.spec.ts tests/e2e/studio-canvas-link.spec.ts tests/e2e/geogebra-mount.spec.ts
git commit -m "feat: complete teacher studio review-to-canvas loop"
```

## Notes For Execution

1. 所有确认/修正状态都必须留在浏览器本地快照里，不能依赖新的远端字段。
2. GeoGebra 聚焦效果必须是临时 UI 效果，不允许污染 scene snapshot 或影响回滚语义。
3. 对象标签提取只做启发式 best-effort；解析失败时，UI 仍需保留“无法定位，请手动核对”的安全降级。
4. compact/mobile 的目标不是做复杂交互，而是保证“老师能从待确认项跳到画布继续核对”。
5. 如果某一步发现 GeoGebra 运行时能力不足以做安全高亮，应优先保留 focus notice + surface switch，不要为了追求特效破坏当前绘图稳定性。
