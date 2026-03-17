# Web Maintainability Phase 4 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在不改变现有 Web 对外行为、备份协议、运行时配置语义和 GeoGebra 工作流的前提下，继续拆解剩余 5 个 Web maintainability hotspots，把当前超预算的组件与 store 全部压回预算线内，并把新的边界通过 workspace architecture tests 与 baseline 文档固化下来。

**Architecture:** Phase 4 继续沿用前 3 轮已经验证有效的路线：让顶层文件退化为薄 shell，把大 JSX 区块拆成按领域组织的 section/layout 组件，把状态转换与副作用编排下沉到 pure helper 或聚焦 action module，并用 line-budget + import-boundary tests 持续防止回潮。这份计划默认采用“本轮直接清理完剩余 5 个热点”的积极路线，而不是只拆前 1-2 个热点后再观察。

**Tech Stack:** React 19, TypeScript, Zustand, Vitest, pnpm, Vite, CSS, GeoGebra vendor runtime

---

## Phase 4 Scope

这轮只处理 Web 侧剩余的维护性热点，不进入 Gateway API 改造，不修改 protocol schema，不引入新的状态管理库，也不改现有用户可见交互语义。

当前剩余 active hotspots：

1. `apps/web/src/components/SettingsDrawer.tsx` (`926`)
2. `apps/web/src/components/WorkspaceShell.tsx` (`646`)
3. `apps/web/src/state/chat-store.ts` (`641`)
4. `apps/web/src/components/settings-drawer/SettingsDataSection.tsx` (`612`)
5. `apps/web/src/components/CanvasPanel.tsx` (`575`)

本阶段完成后应满足：

1. `SettingsDrawer.tsx` 只保留 drawer shell、section navigation 和顶层 wiring；通用设置、模型/预设、当前会话等区块不再全部内联。
2. `SettingsDataSection.tsx` 退化为数据安全页的编排层，本地导入、恢复锚点、远端同步、数据维护/调试不再全部堆在一个 JSX 文件里。
3. `WorkspaceShell.tsx` 主要负责 store wiring 和顶层 surface composition；桌面/紧凑布局、viewport 推导、history drawer layout 计算不再全部内联。
4. `chat-store.ts` 主要负责 store creation、exports 和 storage sync；conversation helpers 与 send-side state mutation 不再全部聚合在一个文件。
5. `CanvasPanel.tsx` 主要负责 React 生命周期与 host ref；GeoGebra runtime loader、scene capture orchestration、listener binding 不再全部内联。
6. `pnpm verify:architecture` 继续通过，并且默认 hotspot report 不再报告上述 5 个 Web 文件。

---

### Task 1: Split Settings Drawer Shell Into Domain Sections

**Files:**
- Create: `apps/web/src/components/settings-drawer/settings-drawer-drafts.ts`
- Create: `apps/web/src/components/settings-drawer/settings-drawer-drafts.test.ts`
- Create: `apps/web/src/components/settings-drawer/SettingsGeneralSection.tsx`
- Create: `apps/web/src/components/settings-drawer/SettingsModelsSection.tsx`
- Create: `apps/web/src/components/settings-drawer/SettingsSessionSection.tsx`
- Modify: `apps/web/src/components/SettingsDrawer.tsx`
- Modify: `tests/workspace/component-extraction.test.ts`

**Step 1: Write the failing tests**

先把 Settings Drawer 的目标边界写死：

```ts
// tests/workspace/component-extraction.test.ts
expect(settingsDrawer).toContain("./settings-drawer/SettingsGeneralSection");
expect(settingsDrawer).toContain("./settings-drawer/SettingsModelsSection");
expect(settingsDrawer).toContain("./settings-drawer/SettingsSessionSection");
expect(countLines("apps/web/src/components/SettingsDrawer.tsx")).toBeLessThan(500);
```

再给 draft converter 建一个聚焦测试：

```ts
// apps/web/src/components/settings-drawer/settings-drawer-drafts.test.ts
import { describe, expect, it } from "vitest";
import {
  fromByokPreset,
  fromOfficialPreset,
  fromRuntimeProfile,
  makeEmptyByokDraft,
  makeEmptyOfficialDraft
} from "./settings-drawer-drafts";

describe("settings drawer drafts", () => {
  it("builds empty BYOK and official drafts with stable defaults", () => {
    expect(makeEmptyByokDraft()).toMatchObject({
      model: "gpt-4o-mini",
      temperature: "0.2"
    });
    expect(makeEmptyOfficialDraft()).toMatchObject({
      model: "gpt-4o-mini",
      temperature: "0.2"
    });
  });

  it("maps runtime profiles into editable runtime drafts", () => {
    expect(
      fromRuntimeProfile({
        id: "gateway-a",
        name: "Gateway A",
        target: "gateway",
        baseUrl: "https://gateway.example.com"
      })
    ).toMatchObject({
      id: "gateway-a",
      target: "gateway"
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --run apps/web/src/components/settings-drawer/settings-drawer-drafts.test.ts tests/workspace/component-extraction.test.ts`

Expected: FAIL because the draft module and section components do not exist yet, and `SettingsDrawer.tsx` is still well over the new line budget.

**Step 3: Write minimal implementation**

把 Settings Drawer 拆成“draft helpers + section components + shell”三层：

```ts
// apps/web/src/components/settings-drawer/settings-drawer-drafts.ts
export interface ByokDraft { ... }
export interface OfficialDraft { ... }
export interface RuntimeDraft { ... }

export const fromByokPreset = (...) => ({ ... });
export const makeEmptyByokDraft = () => ({ ... });
export const fromOfficialPreset = (...) => ({ ... });
export const makeEmptyOfficialDraft = () => ({ ... });
export const fromRuntimeProfile = (...) => ({ ... });
```

```tsx
// apps/web/src/components/settings-drawer/SettingsGeneralSection.tsx
export const SettingsGeneralSection = (props: { ... }) => (
  <section className="settings-section settings-section-general">...</section>
);
```

```tsx
// apps/web/src/components/settings-drawer/SettingsModelsSection.tsx
export const SettingsModelsSection = (props: { ... }) => (
  <section className="settings-section" data-testid="settings-byok-section">...</section>
);
```

```tsx
// apps/web/src/components/settings-drawer/SettingsSessionSection.tsx
export const SettingsSessionSection = (props: { ... }) => (
  <section className="settings-section">...</section>
);
```

`apps/web/src/components/SettingsDrawer.tsx` 保留：

1. drawer open/close shell
2. focus trap / keyboard handling
3. top-level selected section state
4. store wiring
5. section component composition

不要修改 `SettingsExperimentsSection` 和 `SettingsDataSection` 的对外 props；先做纯粹拆分。

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --run apps/web/src/components/settings-drawer/settings-drawer-drafts.test.ts tests/workspace/component-extraction.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/components/settings-drawer/settings-drawer-drafts.ts \
  apps/web/src/components/settings-drawer/settings-drawer-drafts.test.ts \
  apps/web/src/components/settings-drawer/SettingsGeneralSection.tsx \
  apps/web/src/components/settings-drawer/SettingsModelsSection.tsx \
  apps/web/src/components/settings-drawer/SettingsSessionSection.tsx \
  apps/web/src/components/SettingsDrawer.tsx \
  tests/workspace/component-extraction.test.ts
git commit -m "refactor: split settings drawer sections"
```

---

### Task 2: Split Settings Data Section Into Backup, Rollback, Remote Sync, and Maintenance Panels

**Files:**
- Create: `apps/web/src/components/settings-drawer/data-section/LocalBackupSection.tsx`
- Create: `apps/web/src/components/settings-drawer/data-section/ImportRollbackSection.tsx`
- Create: `apps/web/src/components/settings-drawer/data-section/RemoteBackupSection.tsx`
- Create: `apps/web/src/components/settings-drawer/data-section/DataMaintenanceSection.tsx`
- Modify: `apps/web/src/components/settings-drawer/SettingsDataSection.tsx`
- Modify: `tests/workspace/component-extraction.test.ts`

**Step 1: Write the failing tests**

继续用 extraction guardrail 把目标写死：

```ts
// tests/workspace/component-extraction.test.ts
const settingsDataSection = fs.readFileSync(
  "apps/web/src/components/settings-drawer/SettingsDataSection.tsx",
  "utf8"
);

expect(settingsDataSection).toContain("./data-section/LocalBackupSection");
expect(settingsDataSection).toContain("./data-section/ImportRollbackSection");
expect(settingsDataSection).toContain("./data-section/RemoteBackupSection");
expect(settingsDataSection).toContain("./data-section/DataMaintenanceSection");
expect(
  countLines("apps/web/src/components/settings-drawer/SettingsDataSection.tsx")
).toBeLessThan(400);
```

为了保证拆分前后的远端备份展示语义不被破坏，这一步的失败测试运行时顺便保留现有 helper tests：

Run later with:
`apps/web/src/components/settings-remote-backup-actions.test.ts`
`apps/web/src/components/settings-remote-backup-history.test.ts`
`apps/web/src/components/settings-remote-backup-import.test.ts`
`apps/web/src/components/settings-remote-backup-sync.test.ts`

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --run tests/workspace/component-extraction.test.ts`

Expected: FAIL because `SettingsDataSection.tsx` still contains all four大块 JSX，且没有引入这些新的 sub-panels。

**Step 3: Write minimal implementation**

按页面职责拆成四个 section component：

```tsx
// apps/web/src/components/settings-drawer/data-section/LocalBackupSection.tsx
export const LocalBackupSection = (props: { ... }) => (
  <>
    <h3>备份与恢复</h3>
    ...
  </>
);
```

```tsx
// apps/web/src/components/settings-drawer/data-section/ImportRollbackSection.tsx
export const ImportRollbackSection = (props: { ... }) => (
  <article data-testid="import-rollback-anchor">...</article>
);
```

```tsx
// apps/web/src/components/settings-drawer/data-section/RemoteBackupSection.tsx
export const RemoteBackupSection = (props: { ... }) => (
  <section className="settings-section">...</section>
);
```

```tsx
// apps/web/src/components/settings-drawer/data-section/DataMaintenanceSection.tsx
export const DataMaintenanceSection = (props: { ... }) => (
  <section className="settings-section">...</section>
);
```

`SettingsDataSection.tsx` 只保留 prop aggregation、section 顺序编排和 hidden file input，不要重新设计 UI 文案或 className。

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --run tests/workspace/component-extraction.test.ts apps/web/src/components/settings-remote-backup-actions.test.ts apps/web/src/components/settings-remote-backup-history.test.ts apps/web/src/components/settings-remote-backup-import.test.ts apps/web/src/components/settings-remote-backup-sync.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/components/settings-drawer/data-section \
  apps/web/src/components/settings-drawer/SettingsDataSection.tsx \
  tests/workspace/component-extraction.test.ts
git commit -m "refactor: split settings data section panels"
```

---

### Task 3: Split Workspace Shell Viewport and Layout Orchestration

**Files:**
- Create: `apps/web/src/components/workspace-shell/viewport.ts`
- Create: `apps/web/src/components/workspace-shell/viewport.test.ts`
- Create: `apps/web/src/components/workspace-shell/history-layout.ts`
- Create: `apps/web/src/components/workspace-shell/history-layout.test.ts`
- Create: `apps/web/src/components/workspace-shell/WorkspaceDesktopLayout.tsx`
- Create: `apps/web/src/components/workspace-shell/WorkspaceCompactLayout.tsx`
- Modify: `apps/web/src/components/WorkspaceShell.tsx`
- Modify: `tests/workspace/component-extraction.test.ts`

**Step 1: Write the failing tests**

先把可纯测的 viewport/layout 逻辑提炼为 failing tests：

```ts
// apps/web/src/components/workspace-shell/viewport.test.ts
import { describe, expect, it } from "vitest";
import { resolveWorkspaceViewportState } from "./viewport";

describe("workspace viewport", () => {
  it("marks short and compact viewports consistently", () => {
    expect(resolveWorkspaceViewportState({ width: 680, height: 480 })).toEqual({
      compactViewport: true,
      phoneViewport: true,
      shortViewport: true
    });
  });
});
```

```ts
// apps/web/src/components/workspace-shell/history-layout.test.ts
import { describe, expect, it } from "vitest";
import { resolveHistoryDrawerLayout } from "./history-layout";

describe("workspace history layout", () => {
  it("switches to overlay sizing when inline history would crush the chat width", () => {
    expect(
      resolveHistoryDrawerLayout({
        compactViewport: false,
        chatShellWidth: 540,
        historyDrawerWidth: 320
      })
    ).toMatchObject({
      desktopHistoryOverlay: true
    });
  });
});
```

然后升级 extraction guardrail：

```ts
// tests/workspace/component-extraction.test.ts
expect(workspaceShell).toContain("./workspace-shell/WorkspaceDesktopLayout");
expect(workspaceShell).toContain("./workspace-shell/WorkspaceCompactLayout");
expect(workspaceShell).toContain("./workspace-shell/viewport");
expect(workspaceShell).toContain("./workspace-shell/history-layout");
expect(countLines("apps/web/src/components/WorkspaceShell.tsx")).toBeLessThan(500);
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --run apps/web/src/components/workspace-shell/viewport.test.ts apps/web/src/components/workspace-shell/history-layout.test.ts tests/workspace/component-extraction.test.ts`

Expected: FAIL because these helper/layout modules do not exist yet and `WorkspaceShell.tsx` is still above the new budget.

**Step 3: Write minimal implementation**

把 `WorkspaceShell.tsx` 拆成“pure calculations + desktop/compact layout components + top-level shell”：

```ts
// apps/web/src/components/workspace-shell/viewport.ts
export const resolveWorkspaceViewportState = (input: {
  width: number;
  height: number;
}) => ({
  shortViewport: input.height <= 500,
  compactViewport: input.width <= 900 || input.height <= 500,
  phoneViewport: input.width <= 700
});
```

```ts
// apps/web/src/components/workspace-shell/history-layout.ts
export const resolveHistoryDrawerLayout = (input: { ... }) => ({
  desktopHistoryOverlay: ...,
  desktopHistoryFullOverlay: ...,
  historyDrawerMaxWidth: ...
});
```

```tsx
// apps/web/src/components/workspace-shell/WorkspaceDesktopLayout.tsx
export const WorkspaceDesktopLayout = (props: { ... }) => <>...</>;
```

```tsx
// apps/web/src/components/workspace-shell/WorkspaceCompactLayout.tsx
export const WorkspaceCompactLayout = (props: { ... }) => <>...</>;
```

`WorkspaceShell.tsx` 保留：

1. store wiring
2. top-level refs
3. runtime/composer hook 调用
4. menu/history event handlers
5. desktop vs compact layout switch

不要修改 `WorkspaceConversationSidebar`、`WorkspaceChatMessages`、`WorkspaceChatComposer` 的外部 props。

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --run apps/web/src/components/workspace-shell/viewport.test.ts apps/web/src/components/workspace-shell/history-layout.test.ts tests/workspace/component-extraction.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/components/workspace-shell/viewport.ts \
  apps/web/src/components/workspace-shell/viewport.test.ts \
  apps/web/src/components/workspace-shell/history-layout.ts \
  apps/web/src/components/workspace-shell/history-layout.test.ts \
  apps/web/src/components/workspace-shell/WorkspaceDesktopLayout.tsx \
  apps/web/src/components/workspace-shell/WorkspaceCompactLayout.tsx \
  apps/web/src/components/WorkspaceShell.tsx \
  tests/workspace/component-extraction.test.ts
git commit -m "refactor: split workspace shell layouts"
```

---

### Task 4: Split Chat Store Helpers and Send-Side Actions

**Files:**
- Create: `apps/web/src/state/chat-store-helpers.ts`
- Create: `apps/web/src/state/chat-store-helpers.test.ts`
- Create: `apps/web/src/state/chat-store-actions.ts`
- Create: `apps/web/src/state/chat-store-actions.test.ts`
- Modify: `apps/web/src/state/chat-store.ts`
- Modify: `apps/web/src/state/chat-store.test.ts`
- Modify: `tests/workspace/state-storage-boundaries.test.ts`

**Step 1: Write the failing tests**

先把纯 helper 和 store wiring 边界写死：

```ts
// apps/web/src/state/chat-store-helpers.test.ts
import { describe, expect, it } from "vitest";
import {
  buildConversationTitle,
  createConversationThread,
  moveConversationToTop,
  normalizeSendInput
} from "./chat-store-helpers";

describe("chat store helpers", () => {
  it("builds attachment-aware fallback titles", () => {
    expect(buildConversationTitle({ content: "", attachments: [{ kind: "image" }] }))
      .toBe("图片消息");
  });

  it("moves updated conversations to the top", () => {
    const first = createConversationThread("A");
    const second = createConversationThread("B");
    expect(moveConversationToTop([first, second], second)[0]?.id).toBe(second.id);
  });

  it("normalizes string and object send inputs", () => {
    expect(normalizeSendInput("hello")).toEqual({
      content: "hello",
      attachments: []
    });
  });
});
```

```ts
// tests/workspace/state-storage-boundaries.test.ts
expect(chatStore).toContain("./chat-store-helpers");
expect(chatStore).toContain("./chat-store-actions");
expect(countLines("apps/web/src/state/chat-store.ts")).toBeLessThan(500);
```

`chat-store-actions.test.ts` 可以先锁住一个最容易回归的行为，例如创建新会话时仍正确初始化消息列表，或发送成功后仍把会话移到顶部。

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --run apps/web/src/state/chat-store-helpers.test.ts apps/web/src/state/chat-store-actions.test.ts tests/workspace/state-storage-boundaries.test.ts apps/web/src/state/chat-store.test.ts`

Expected: FAIL because the helper/action modules do not exist yet and `chat-store.ts` still owns all logic。

**Step 3: Write minimal implementation**

先把纯 helper 从 store 文件抽离：

```ts
// apps/web/src/state/chat-store-helpers.ts
export const buildConversationTitle = (...) => { ... };
export const createConversationThread = (...) => { ... };
export const moveConversationToTop = (...) => { ... };
export const normalizeSendInput = (...) => { ... };
export const toPersistedChatSnapshot = (...) => { ... };
export const buildStateWithAssistantMessage = (...) => { ... };
```

再把 send/create/select 等 stateful 行为放进 action module：

```ts
// apps/web/src/state/chat-store-actions.ts
export const createChatStoreActions = (deps: {
  set: StoreApi<ChatStoreState>["setState"];
  get: () => ChatStoreState;
  saveState: (state: PersistableChatState) => void;
  externalDeps: ChatStoreDeps;
}) => ({
  createConversation: () => ...,
  selectConversation: (conversationId: string) => ...,
  send: async (input: string | ChatSendInput) => ...,
  sendFollowUpPrompt: async (prompt: string) => ...
});
```

`chat-store.ts` 主要保留：

1. exported types
2. `defaultDeps`
3. `createChatStore`
4. singleton exports
5. storage sync exports

不要改 `useChatStore` 对外用法，不要改 `chat-send-flow.ts` 的职责。

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --run apps/web/src/state/chat-store-helpers.test.ts apps/web/src/state/chat-store-actions.test.ts tests/workspace/state-storage-boundaries.test.ts apps/web/src/state/chat-store.test.ts apps/web/src/state/chat-send-flow.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/state/chat-store-helpers.ts \
  apps/web/src/state/chat-store-helpers.test.ts \
  apps/web/src/state/chat-store-actions.ts \
  apps/web/src/state/chat-store-actions.test.ts \
  apps/web/src/state/chat-store.ts \
  apps/web/src/state/chat-store.test.ts \
  tests/workspace/state-storage-boundaries.test.ts
git commit -m "refactor: split chat store helpers and actions"
```

---

### Task 5: Split Canvas Panel Runtime and Scene-Sync Helpers

**Files:**
- Create: `apps/web/src/components/canvas-panel/runtime.ts`
- Create: `apps/web/src/components/canvas-panel/runtime.test.ts`
- Create: `apps/web/src/components/canvas-panel/scene-sync.ts`
- Create: `apps/web/src/components/canvas-panel/scene-sync.test.ts`
- Modify: `apps/web/src/components/CanvasPanel.tsx`
- Modify: `apps/web/src/components/CanvasPanel.test.ts`
- Modify: `tests/workspace/component-extraction.test.ts`

**Step 1: Write the failing tests**

先把 `CanvasPanel` 的 React / non-React 边界写死：

```ts
// tests/workspace/component-extraction.test.ts
const canvasPanel = fs.readFileSync("apps/web/src/components/CanvasPanel.tsx", "utf8");

expect(canvasPanel).toContain("./canvas-panel/runtime");
expect(canvasPanel).toContain("./canvas-panel/scene-sync");
expect(countLines("apps/web/src/components/CanvasPanel.tsx")).toBeLessThan(400);
```

再给纯 helper 建测试：

```ts
// apps/web/src/components/canvas-panel/runtime.test.ts
import { describe, expect, it } from "vitest";
import { toAppletConfig } from "./runtime";

describe("canvas runtime", () => {
  it("keeps autoscale disabled for desktop and mobile profiles", () => {
    expect(toAppletConfig("desktop")).toMatchObject({ disableAutoScale: true });
    expect(toAppletConfig("mobile")).toMatchObject({
      disableAutoScale: true,
      showAlgebraInput: false
    });
  });
});
```

```ts
// apps/web/src/components/canvas-panel/scene-sync.test.ts
import { describe, expect, it } from "vitest";
import { createSceneCaptureController } from "./scene-sync";

describe("canvas scene sync", () => {
  it("suppresses immediate flushes while capture is temporarily muted", () => {
    const controller = createSceneCaptureController(() => "<xml />");
    controller.suppress(200);
    expect(controller.canFlushAt(Date.now())).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --run apps/web/src/components/canvas-panel/runtime.test.ts apps/web/src/components/canvas-panel/scene-sync.test.ts tests/workspace/component-extraction.test.ts apps/web/src/components/CanvasPanel.test.ts`

Expected: FAIL because the extracted helper modules do not exist yet and `CanvasPanel.tsx` is still above the target budget.

**Step 3: Write minimal implementation**

把 non-React logic 抽离到 `canvas-panel/` 目录：

```ts
// apps/web/src/components/canvas-panel/runtime.ts
export const GGB_MANIFEST_PATH = "/vendor/geogebra/manifest.json";
export const loadGeoGebraManifest = async () => { ... };
export const ensureGeoGebraScript = async (scriptUrl: string) => { ... };
export const resolveAppletObject = (...) => { ... };
export const toAppletConfig = (...) => ({ ... });
```

```ts
// apps/web/src/components/canvas-panel/scene-sync.ts
export const createSceneCaptureController = (
  readXml: () => string | null
) => ({
  suppress: (durationMs = 280) => { ... },
  canFlushAt: (timestamp: number) => { ... },
  flushNow: () => { ... }
});

export const bindGeoGebraSceneListeners = (appletObject: GeoGebraAppletObject | null, onChange: () => void) => { ... };
```

`CanvasPanel.tsx` 只保留：

1. React refs/state
2. lifecycle effects
3. host mounting / cleanup
4. extracted helpers composition

并把现有 `CanvasPanel.test.ts` 改为从 `./canvas-panel/runtime` 导入 `toAppletConfig`。

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --run apps/web/src/components/canvas-panel/runtime.test.ts apps/web/src/components/canvas-panel/scene-sync.test.ts apps/web/src/components/CanvasPanel.test.ts tests/workspace/component-extraction.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/components/canvas-panel \
  apps/web/src/components/CanvasPanel.tsx \
  apps/web/src/components/CanvasPanel.test.ts \
  tests/workspace/component-extraction.test.ts
git commit -m "refactor: split canvas runtime helpers"
```

---

### Task 6: Ratchet Phase 4 Guardrails and Baseline to the New Steady State

**Files:**
- Modify: `tests/workspace/component-extraction.test.ts`
- Modify: `tests/workspace/state-storage-boundaries.test.ts`
- Modify: `tests/workspace/architecture-budgets.test.ts`
- Modify: `docs/architecture/maintainability-baseline.md`
- Modify: `scripts/quality/report-hotspots.mjs`

**Step 1: Write the failing tests**

最后把 Phase 4 的目标写成 guardrails：

```ts
// tests/workspace/component-extraction.test.ts
expect(countLines("apps/web/src/components/SettingsDrawer.tsx")).toBeLessThan(500);
expect(
  countLines("apps/web/src/components/settings-drawer/SettingsDataSection.tsx")
).toBeLessThan(400);
expect(countLines("apps/web/src/components/WorkspaceShell.tsx")).toBeLessThan(500);
expect(countLines("apps/web/src/components/CanvasPanel.tsx")).toBeLessThan(400);
```

```ts
// tests/workspace/state-storage-boundaries.test.ts
expect(countLines("apps/web/src/state/chat-store.ts")).toBeLessThan(500);
```

```ts
// tests/workspace/architecture-budgets.test.ts
expect(hotspotPaths).not.toContain("apps/web/src/components/SettingsDrawer.tsx");
expect(hotspotPaths).not.toContain("apps/web/src/components/WorkspaceShell.tsx");
expect(hotspotPaths).not.toContain("apps/web/src/state/chat-store.ts");
expect(hotspotPaths).not.toContain(
  "apps/web/src/components/settings-drawer/SettingsDataSection.tsx"
);
expect(hotspotPaths).not.toContain("apps/web/src/components/CanvasPanel.tsx");
expect(countLines("apps/web/src/state/chat-store.ts")).toBeLessThan(500);
expect(baseline).toContain("No active production hotspots over budget");
expect(baseline).toContain("SettingsDrawer.tsx < 500");
expect(baseline).toContain("SettingsDataSection.tsx < 400");
expect(baseline).toContain("WorkspaceShell.tsx < 500");
expect(baseline).toContain("CanvasPanel.tsx < 400");
expect(baseline).toContain("chat-store.ts < 500");
```

如果 Phase 4 执行完成后默认 hotspot report 已经为空，测试应明确允许 “No over-budget files detected.” 作为新的稳定输出。

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --run tests/workspace/component-extraction.test.ts tests/workspace/state-storage-boundaries.test.ts tests/workspace/architecture-budgets.test.ts`

Expected: FAIL until all new line budgets and baseline text are updated together.

**Step 3: Write minimal implementation**

同步收尾：

1. 更新 `docs/architecture/maintainability-baseline.md`
2. 如有必要，更新 `scripts/quality/report-hotspots.mjs` 的 `requiredHotspots`
3. 把 “当前热点” 改成 Phase 4 完成后的真实状态

如果所有热点都已经退回预算内，baseline 至少要包含：

1. 默认 hotspot report 仍是 production-only
2. `SettingsDrawer.tsx < 500`
3. `SettingsDataSection.tsx < 400`
4. `WorkspaceShell.tsx < 500`
5. `CanvasPanel.tsx < 400`
6. `chat-store.ts < 500`
7. `No active production hotspots over budget`

不要为了让 baseline 好看而放宽 budget；如果仍有真实 hotspot，停下来继续拆分，不要提前收尾。

**Step 4: Run test to verify it passes**

Run: `pnpm verify:architecture`

Expected: PASS with:

1. workspace tests green
2. default hotspot report no longer listing the five historical Web hotspots
3. `pnpm build:web` passing
4. `pnpm quality:build-warnings` reporting no actionable warnings

**Step 5: Commit**

```bash
git add tests/workspace/component-extraction.test.ts \
  tests/workspace/state-storage-boundaries.test.ts \
  tests/workspace/architecture-budgets.test.ts \
  docs/architecture/maintainability-baseline.md \
  scripts/quality/report-hotspots.mjs
git commit -m "test: ratchet phase 4 maintainability guardrails"
```
