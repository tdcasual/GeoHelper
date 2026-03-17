# GeoHelper Teacher Studio Review Flow Implementation Plan

Status: Implemented on `main` through Task 4 on 2026-03-17

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把当前的 teacher studio 从“结构已经成立”推进到“老师能快速判断结果是否可信、能继续确认/补图/重试”的可用主链路。

**Architecture:** 保持现有 `WorkspaceShell + chat/scene/template/settings stores + GeoGebra runtime` 不变，不增加后端能力，也不引入新的云端状态模型。重点把 assistant 结果从“依赖文案字符串”升级为浏览器内可持久化的结构化 `result contract`，然后让右侧结果 rail、继续补图面板、失败提示、follow-up 动作都围绕这份 contract 运行。所有状态仍然是 `local-first`，证明辅助、确认项、继续编辑和失败重试都只是浏览器端对现有 compile/runtime 流的更清晰编排。

**Tech Stack:** React 19, TypeScript, Zustand, Vitest, Playwright, existing `@geohelper/protocol` `CommandBatch`, existing workspace shell/layout modules

---

## Scope

本计划只覆盖新总纲里的两条优先路线：

1. `Track A: Teacher Studio Workflow Completion`
2. `Track B: Generation Reliability and Reviewability`

明确不在本计划内：

1. SQL / message-level cloud sync / server-authoritative state
2. 多租户、账户体系、权限、billing
3. 自动后台 pull / merge / restore
4. 全量“课堂演示模式”或复杂导出链路

---

### Task 1: 引入可持久化的 studio result contract

**Files:**
- Create: `apps/web/src/state/chat-result.ts`
- Create: `apps/web/src/state/chat-result.test.ts`
- Modify: `apps/web/src/state/chat-store.ts`
- Modify: `apps/web/src/state/chat-persistence.ts`
- Modify: `apps/web/src/state/chat-store-helpers.ts`
- Modify: `apps/web/src/state/chat-store-helpers.test.ts`

**Step 1: Write the failing test**

新增 `chat-result.test.ts`，覆盖：

1. compile 成功结果可被归一化为结构化 `result contract`
2. guard / error 结果也能映射到统一的 `status`
3. contract 可安全持久化到 `localStorage` 快照并从旧快照兼容恢复

最小 contract 目标：

```ts
export interface ChatStudioResult {
  status: "success" | "guard" | "error";
  commandCount: number;
  summaryItems: string[];
  explanationLines: string[];
  warningItems: string[];
  uncertaintyItems: Array<{
    id: string;
    label: string;
    followUpPrompt: string;
  }>;
}
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @geohelper/web test -- --run src/state/chat-result.test.ts src/state/chat-store-helpers.test.ts`
Expected: FAIL because `chat-result.ts` and the new persisted field do not exist.

**Step 3: Write minimal implementation**

实现：

1. 在 `chat-result.ts` 中定义 `ChatStudioResult`、builder helpers、旧快照兼容 normalize helper
2. 在 `ChatMessage` 上新增可选 `result?: ChatStudioResult`
3. 在 `chat-persistence.ts` / `chat-store-helpers.ts` 中确保新字段能被安全保存和恢复
4. 旧消息没有 `result` 时必须继续可读，不能破坏已有聊天快照

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @geohelper/web test -- --run src/state/chat-result.test.ts src/state/chat-store-helpers.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/state/chat-result.ts apps/web/src/state/chat-result.test.ts apps/web/src/state/chat-store.ts apps/web/src/state/chat-persistence.ts apps/web/src/state/chat-store-helpers.ts apps/web/src/state/chat-store-helpers.test.ts
git commit -m "feat: add persisted studio result contract"
```

### Task 2: 让 compile / guard / error 都产出教师可审阅的结果语义

**Files:**
- Modify: `apps/web/src/state/chat-send-flow.ts`
- Modify: `apps/web/src/state/chat-send-flow.test.ts`
- Modify: `apps/web/src/state/chat-store-actions.ts`
- Modify: `apps/web/src/state/chat-store-actions.test.ts`
- Test: `tests/e2e/chat-to-render.spec.ts`

**Step 1: Write the failing tests**

扩展 `chat-send-flow.test.ts`，覆盖：

1. compile 成功时优先从 `batch.explanations` 构造 `summaryItems`
2. `batch.post_checks` 能进入 `warningItems` 或 `uncertaintyItems`
3. 没有 explanations 时，才回退到 `已生成 N 条指令`
4. guard / error 消息也要携带结构化 `result.status`

示例目标：

```ts
expect(message.result).toMatchObject({
  status: "success",
  commandCount: 2,
  summaryItems: ["已创建三角形 ABC", "已作角平分线 AD"]
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @geohelper/web test -- --run src/state/chat-send-flow.test.ts src/state/chat-store-actions.test.ts`
Expected: FAIL because the send flow still only writes plain `content`.

**Step 3: Write minimal implementation**

实现：

1. 在 `buildAssistantMessageFromCompileResult` 中生成 `result`
2. 使用下列优先级构造结果语义：
   - `batch.explanations`
   - `batch.post_checks`
   - `batch.commands.length`
3. `buildAssistantMessageFromGuard` / `buildAssistantMessageFromError` 同样生成 `result`
4. `content` 继续保留为人类可读摘要，但 UI 之后不再把它当唯一结构来源

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter @geohelper/web test -- --run src/state/chat-send-flow.test.ts src/state/chat-store-actions.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/state/chat-send-flow.ts apps/web/src/state/chat-send-flow.test.ts apps/web/src/state/chat-store-actions.ts apps/web/src/state/chat-store-actions.test.ts tests/e2e/chat-to-render.spec.ts
git commit -m "feat: build teacher-facing result semantics from compile flow"
```

### Task 3: 把结果 rail 重构为可确认、可跟进、可降级的 review panel

**Files:**
- Modify: `apps/web/src/components/studio-result-panel.ts`
- Modify: `apps/web/src/components/studio-result-panel.test.ts`
- Modify: `apps/web/src/components/StudioResultPanel.tsx`
- Modify: `apps/web/src/components/proof-assist-actions.ts`
- Modify: `apps/web/src/components/proof-assist-actions.test.ts`
- Modify: `apps/web/src/components/workspace-shell/WorkspaceDesktopLayout.tsx`
- Modify: `apps/web/src/components/workspace-shell/WorkspaceChatMessages.tsx`
- Test: `tests/e2e/studio-result-panel.spec.ts`

**Step 1: Write the failing tests**

扩展结果面板测试，覆盖：

1. `StudioResultPanel` 优先读取 `message.result`
2. `待确认` 项显示为明确的 review list，而不是只是一行文本
3. follow-up actions 的 prompt 取自结构化结果，不再解析 `待确认：` 字符串
4. `error` / `guard` 状态下显示可理解的降级提示，并禁用不合适的下一步动作

示例目标：

```ts
expect(viewModel.status).toBe("success");
expect(viewModel.uncertainties[0]?.label).toContain("点 D 在线段 BC 上");
expect(viewModel.nextActions[0]?.disabled).toBe(false);
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @geohelper/web test -- --run src/components/studio-result-panel.test.ts src/components/proof-assist-actions.test.ts`
Expected: FAIL because the current panel still parses raw text lines.

**Step 3: Write minimal implementation**

实现：

1. `studio-result-panel.ts` 改为基于 `message.result` 构建 view model
2. `StudioResultPanel.tsx` 增加以下稳定区块：
   - `结果状态`
   - `图形摘要`
   - `执行步骤`
   - `待确认`
   - `下一步动作`
3. `proof-assist-actions.ts` 从 `ChatStudioResult` 生成 prompt
4. `WorkspaceChatMessages.tsx` 保留原消息流，但 assistant 文本可降级展示为“摘要回执”，避免和右侧结构面板重复抢主视觉

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter @geohelper/web test -- --run src/components/studio-result-panel.test.ts src/components/proof-assist-actions.test.ts`
Run: `pnpm exec playwright test tests/e2e/studio-result-panel.spec.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/components/studio-result-panel.ts apps/web/src/components/studio-result-panel.test.ts apps/web/src/components/StudioResultPanel.tsx apps/web/src/components/proof-assist-actions.ts apps/web/src/components/proof-assist-actions.test.ts apps/web/src/components/workspace-shell/WorkspaceDesktopLayout.tsx apps/web/src/components/workspace-shell/WorkspaceChatMessages.tsx tests/e2e/studio-result-panel.spec.ts
git commit -m "feat: upgrade studio result rail into review panel"
```

### Task 4: 把“继续补图”升级为最近图稿 + 模板 + 快速续写入口

**Files:**
- Create: `apps/web/src/components/StudioContinuePanel.tsx`
- Modify: `apps/web/src/components/StudioInputPanel.tsx`
- Modify: `apps/web/src/components/workspace-shell/WorkspaceDesktopLayout.tsx`
- Modify: `apps/web/src/components/workspace-shell/WorkspaceCompactLayout.tsx`
- Modify: `apps/web/src/components/workspace-shell/layout-props.ts`
- Modify: `apps/web/src/state/template-store.ts`
- Modify: `apps/web/src/state/template-store.test.ts`
- Test: `tests/e2e/studio-input-panel.spec.ts`
- Test: `tests/e2e/teacher-template-library.spec.ts`

**Step 1: Write the failing tests**

新增/扩展覆盖：

1. `继续补图` 面板显示最近会话标题和最近更新时间
2. 可以一键恢复最近会话并把焦点落回 composer
3. 可以在同一面板中看到常用模板入口，而不必先打开独立模板库
4. compact/mobile 下继续补图入口仍可达

**Step 2: Run tests to verify they fail**

Run: `pnpm exec playwright test tests/e2e/studio-input-panel.spec.ts tests/e2e/teacher-template-library.spec.ts`
Expected: FAIL because continue mode currently only显示计数文案。

**Step 3: Write minimal implementation**

实现：

1. 新建 `StudioContinuePanel.tsx`，展示：
   - 最近 3 个会话
   - 最近 3 个模板
   - 一个“继续当前画稿”主按钮
2. `StudioInputPanel.tsx` 不再只接受计数，而是接受结构化 recent conversations / templates
3. `WorkspaceDesktopLayout.tsx` / `WorkspaceCompactLayout.tsx` 传入最近会话与模板数据
4. `template-store.ts` 继续按 `updatedAt` 排序，确保最近模板可直接复用

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter @geohelper/web test -- --run src/state/template-store.test.ts`
Run: `pnpm exec playwright test tests/e2e/studio-input-panel.spec.ts tests/e2e/teacher-template-library.spec.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/components/StudioContinuePanel.tsx apps/web/src/components/StudioInputPanel.tsx apps/web/src/components/workspace-shell/WorkspaceDesktopLayout.tsx apps/web/src/components/workspace-shell/WorkspaceCompactLayout.tsx apps/web/src/components/workspace-shell/layout-props.ts apps/web/src/state/template-store.ts apps/web/src/state/template-store.test.ts tests/e2e/studio-input-panel.spec.ts tests/e2e/teacher-template-library.spec.ts
git commit -m "feat: add recent-work continue flow"
```

### Task 5: 补齐失败重试与 compact/mobile 结果面板的一致性

**Files:**
- Modify: `apps/web/src/components/workspace-shell/WorkspaceCompactLayout.tsx`
- Modify: `apps/web/src/components/WorkspaceShell.tsx`
- Modify: `apps/web/src/components/workspace-shell/useWorkspaceComposer.ts`
- Modify: `apps/web/src/styles/workspace-shell.css`
- Test: `tests/e2e/chat-to-render.spec.ts`
- Test: `tests/e2e/fullscreen-toggle.spec.ts`
- Create: `tests/e2e/studio-review-flow.spec.ts`

**Step 1: Write the failing tests**

新增/扩展 E2E 覆盖：

1. compact/mobile 视图里也能看到最新结果状态与待确认项
2. 失败后结果 rail 出现明确的“重试当前请求”或“回到输入补充条件”提示
3. 切换画布 / 对话 / 全屏时，不丢失最新结果状态

**Step 2: Run tests to verify they fail**

Run: `pnpm exec playwright test tests/e2e/studio-review-flow.spec.ts tests/e2e/chat-to-render.spec.ts tests/e2e/fullscreen-toggle.spec.ts`
Expected: FAIL because compact/mobile 仍然是旧聊天视图语义，失败后也缺少 teacher-facing review guidance。

**Step 3: Write minimal implementation**

实现：

1. `WorkspaceCompactLayout.tsx` 暴露轻量版结果面板或结果摘要入口
2. `WorkspaceShell.tsx` 统一“最新 assistant result”的来源，桌面与 compact 共享
3. `useWorkspaceComposer.ts` 增加一个最小 `retryLatestPrompt` helper，供失败状态下复用
4. `workspace-shell.css` 补齐 compact/mobile 下结果区样式，避免新面板挤压现有 composer

**Step 4: Run tests to verify they pass**

Run: `pnpm exec playwright test tests/e2e/studio-review-flow.spec.ts tests/e2e/chat-to-render.spec.ts tests/e2e/fullscreen-toggle.spec.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/components/workspace-shell/WorkspaceCompactLayout.tsx apps/web/src/components/WorkspaceShell.tsx apps/web/src/components/workspace-shell/useWorkspaceComposer.ts apps/web/src/styles/workspace-shell.css tests/e2e/studio-review-flow.spec.ts tests/e2e/chat-to-render.spec.ts tests/e2e/fullscreen-toggle.spec.ts
git commit -m "feat: align compact studio review flow"
```

### Task 6: 文档收口、计划索引更新与全量验证

**Files:**
- Modify: `docs/plans/README.md`
- Modify: `docs/plans/2026-03-17-product-scope-reset-design.md`
- Verify: `apps/web/src/**`
- Verify: `tests/e2e/**`

**Step 1: Refresh the docs**

更新文档说明：

1. 在 `docs/plans/README.md` 中挂上本计划
2. 在 `2026-03-17-product-scope-reset-design.md` 里补一句“Track A/B 当前执行计划引用本文件”

**Step 2: Run focused unit tests**

Run: `pnpm --filter @geohelper/web test -- --run src/state/chat-result.test.ts src/state/chat-send-flow.test.ts src/components/studio-result-panel.test.ts src/components/proof-assist-actions.test.ts src/state/template-store.test.ts`
Expected: PASS.

**Step 3: Run focused E2E**

Run: `pnpm exec playwright test tests/e2e/studio-result-panel.spec.ts tests/e2e/studio-input-panel.spec.ts tests/e2e/studio-review-flow.spec.ts tests/e2e/teacher-template-library.spec.ts tests/e2e/chat-to-render.spec.ts`
Expected: PASS.

**Step 4: Run workspace verification**

Run: `pnpm typecheck`
Expected: PASS.

Run: `pnpm --filter @geohelper/web build`
Expected: PASS.

**Step 5: Commit**

```bash
git add docs/plans/README.md docs/plans/2026-03-17-product-scope-reset-design.md apps/web/src tests/e2e
git commit -m "feat: deliver teacher studio review flow"
```

---

## Deferred Follow-Ups

这些能力故意不塞进这一期：

1. 完整演示模式与步骤回放
2. 导出图稿 / 课件素材的正式链路
3. 更深入的命令级几何解释器
4. 云端或后端任何扩面

## Delivery Notes

1. 这期成功标准不是“功能变多”，而是老师能更快判断结果是否可信、是否需要补条件、是否应该继续补图或重试。
2. 所有新增状态必须仍然能被本地持久化，且不能破坏现有聊天/备份快照兼容性。
3. 如果实现过程中发现某个子项会逼出新的后端需求，默认降级为浏览器端提示或文案，不要越过当前产品边界。
