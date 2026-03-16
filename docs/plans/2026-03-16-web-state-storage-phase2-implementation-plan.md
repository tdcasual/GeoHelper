# Web State and Storage Phase 2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在不改动现有 Web 对外行为的前提下，把备份、远端同步、运行时解析、聊天发送流程从大组件和大 store 中拆出来，显著缩小前端状态层与持久化层的变更半径，并顺手消除当前已记录的 Vite chunk warning。

**Architecture:** 保持 Zustand store 和顶层组件的公开 API 不变，把“序列化/合并”“远端同步探测与上传”“运行时选项解析”“聊天发送流水线”下沉为可单测的纯 helper 或 service。Phase 2 先收缩 Web 侧边界，再用 workspace 测试和 build warning 检查把新边界固化成自动化约束。

**Tech Stack:** React 19, TypeScript, Zustand, Vitest, Playwright, pnpm, Vite

---

## Phase 2 Scope

这轮只做 Web 侧的状态层与持久化边界收缩，不进入 Gateway 模块化。

本阶段完成后应满足：

1. `apps/web/src/storage/backup.ts` 只保留对外 facade，不再内嵌完整导入/合并/回滚流程。
2. `apps/web/src/storage/remote-sync.ts` 只保留 controller 装配，不再混合配置解析、元数据探测、延迟上传状态机。
3. `apps/web/src/state/settings-store.ts` 主要负责 store state 和 action wiring，运行时解析与调试事件 gating 下沉。
4. `apps/web/src/state/chat-store.ts` 主要负责 state mutation，聊天发送 pipeline 与 snapshot persistence 下沉。
5. `apps/web/src/components/SettingsDrawer.tsx` 和 `apps/web/src/components/WorkspaceShell.tsx` 只做 UI 编排，不直接持有大段远端备份与运行时控制流程。
6. `pnpm build:web` 不再出现当前 `backup.ts` / `remote-sync.ts` / `SettingsDrawer.tsx` 导致的 actionable warning。

---

### Task 1: Split Backup Snapshot and Import Flow

**Files:**
- Create: `apps/web/src/storage/backup-snapshot.ts`
- Create: `apps/web/src/storage/backup-import.ts`
- Create: `apps/web/src/storage/backup-snapshot.test.ts`
- Create: `apps/web/src/storage/backup-import.test.ts`
- Modify: `apps/web/src/storage/backup.ts`
- Modify: `apps/web/src/storage/backup.test.ts`

**Step 1: Write the failing tests**

新增两个聚焦测试文件，覆盖当前 `backup.ts` 里最重的两类职责：

```ts
// apps/web/src/storage/backup-snapshot.test.ts
import { describe, expect, it } from "vitest";
import { readCurrentPersistedAppSnapshots } from "./backup-snapshot";

describe("backup-snapshot", () => {
  it("reads chat/settings/ui/template/scene snapshots from localStorage", () => {
    expect(readCurrentPersistedAppSnapshots().chatSnapshot).toEqual(
      expect.anything()
    );
  });
});
```

```ts
// apps/web/src/storage/backup-import.test.ts
import { describe, expect, it } from "vitest";
import { applyImportedBackupEnvelopeToStorage } from "./backup-import";

describe("backup-import", () => {
  it("replaces all persisted snapshots in replace mode", async () => {
    await applyImportedBackupEnvelopeToStorage(envelope, { mode: "replace" });
    expect(localStorage.getItem("geohelper.chat.snapshot")).toContain("conv_1");
  });

  it("merges conversations and scene snapshots in merge mode", async () => {
    await applyImportedBackupEnvelopeToStorage(envelope, { mode: "merge" });
    expect(localStorage.getItem("geohelper.scene.snapshot")).toContain("scene_ctx");
  });
});
```

把 `apps/web/src/storage/backup.test.ts` 中已有的大流程断言收敛为 facade 回归测试，只校验 `backup.ts` 仍然正确委托给新 helper。

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --run --project @geohelper/web apps/web/src/storage/backup-snapshot.test.ts apps/web/src/storage/backup-import.test.ts`

Expected: FAIL because the new modules do not exist yet.

**Step 3: Write minimal implementation**

新增两个模块，职责切分如下：

```ts
// apps/web/src/storage/backup-snapshot.ts
export interface PersistedAppSnapshots {
  chatSnapshot: unknown;
  settingsSnapshot: unknown;
  uiPreferences: unknown;
  templatesSnapshot: unknown;
  sceneSnapshot: unknown;
}

export const readCurrentPersistedAppSnapshots = (): PersistedAppSnapshots => {
  // centralize localStorage reads and JSON parsing
};

export const syncLiveStoresAfterImport = async (): Promise<void> => {
  // syncChatStoreFromStorage, syncSettingsStoreFromStorage, ...
};
```

```ts
// apps/web/src/storage/backup-import.ts
export const applyImportedBackupEnvelopeToStorage = async (
  envelope: BackupEnvelope,
  options: BackupImportOptions = {}
): Promise<BackupEnvelope> => {
  // normalize structured settings, branch replace/merge, write snapshots, sync stores
};
```

`apps/web/src/storage/backup.ts` 保留现有导出名：

1. `exportCurrentAppBackup`
2. `exportCurrentAppBackupEnvelope`
3. `importAppBackupToLocalStorage`
4. `importBackupEnvelopeToLocalStorage`
5. `importRemoteBackupToLocalStorage`
6. `restoreImportRollbackAnchorToLocalStorage`

但其内部改为调用 `backup-snapshot.ts` 和 `backup-import.ts`，不再自己承载整段导入/合并流程。

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --run --project @geohelper/web apps/web/src/storage/backup-snapshot.test.ts apps/web/src/storage/backup-import.test.ts apps/web/src/storage/backup.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/storage/backup.ts \
  apps/web/src/storage/backup-snapshot.ts \
  apps/web/src/storage/backup-import.ts \
  apps/web/src/storage/backup-snapshot.test.ts \
  apps/web/src/storage/backup-import.test.ts \
  apps/web/src/storage/backup.test.ts
git commit -m "refactor: split backup snapshot and import flow"
```

---

### Task 2: Split Remote Sync Config, Probe, and Delayed Upload Logic

**Files:**
- Create: `apps/web/src/storage/remote-sync-config.ts`
- Create: `apps/web/src/storage/remote-sync-runner.ts`
- Create: `apps/web/src/storage/remote-sync-runner.test.ts`
- Modify: `apps/web/src/storage/remote-sync.ts`
- Modify: `apps/web/src/storage/remote-sync.test.ts`

**Step 1: Write the failing tests**

新增针对探测与延迟上传状态机的聚焦测试：

```ts
// apps/web/src/storage/remote-sync-runner.test.ts
import { describe, expect, it } from "vitest";
import {
  readRemoteSyncReadyConfig,
  runRemoteSyncMetadataProbe,
  runRemoteSyncDelayedUpload
} from "./remote-sync-runner";

describe("remote-sync-runner", () => {
  it("returns null config when mode/baseUrl/token is incomplete", async () => {
    expect(await readRemoteSyncReadyConfig(deps)).toBeNull();
  });

  it("marks upload_blocked_remote_newer when compare result is remote_newer", async () => {
    await runRemoteSyncDelayedUpload(deps);
    expect(setRemoteBackupSyncResult).toHaveBeenCalledWith(
      expect.objectContaining({ status: "upload_blocked_remote_newer" })
    );
  });
});
```

保留 `apps/web/src/storage/remote-sync.test.ts` 作为 controller facade 回归测试，只校验 singleton controller 仍然把调用导向 runner。

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --run --project @geohelper/web apps/web/src/storage/remote-sync-runner.test.ts apps/web/src/storage/remote-sync.test.ts`

Expected: FAIL because the runner module does not exist yet.

**Step 3: Write minimal implementation**

拆分职责：

```ts
// apps/web/src/storage/remote-sync-config.ts
export interface RemoteSyncReadyConfig {
  mode: RemoteBackupSyncMode;
  baseUrl: string;
  adminToken: string;
}

export const readRemoteSyncReadyConfig = async (
  deps: RemoteSyncControllerDeps,
  requiredMode?: RemoteBackupSyncMode
): Promise<RemoteSyncReadyConfig | null> => {
  // centralize mode/baseUrl/token readiness checks
};
```

```ts
// apps/web/src/storage/remote-sync-runner.ts
export const runRemoteSyncMetadataProbe = async (
  deps: RemoteSyncControllerDeps,
  config: RemoteSyncReadyConfig
) => {
  // export local envelope, compare, fetch history, publish result
};

export const runRemoteSyncDelayedUpload = async (
  deps: RemoteSyncControllerDeps,
  config: RemoteSyncReadyConfig
) => {
  // compare local/remote and handle identical, conflict, remote_newer, diverged
};
```

`apps/web/src/storage/remote-sync.ts` 收缩为：

1. controller state (`startupCheckPromise`, timer, `importInProgress`)
2. singleton wiring (`defaultDeps`, `remoteSyncController`)
3. thin calls into `readRemoteSyncReadyConfig`, `runRemoteSyncMetadataProbe`, `runRemoteSyncDelayedUpload`

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --run --project @geohelper/web apps/web/src/storage/remote-sync-runner.test.ts apps/web/src/storage/remote-sync.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/storage/remote-sync.ts \
  apps/web/src/storage/remote-sync-config.ts \
  apps/web/src/storage/remote-sync-runner.ts \
  apps/web/src/storage/remote-sync-runner.test.ts \
  apps/web/src/storage/remote-sync.test.ts
git commit -m "refactor: split remote sync runner from controller"
```

---

### Task 3: Extract Settings Runtime Resolution and Persistence Helpers

**Files:**
- Create: `apps/web/src/state/settings-runtime-resolver.ts`
- Create: `apps/web/src/state/settings-persistence.ts`
- Create: `apps/web/src/state/settings-runtime-resolver.test.ts`
- Modify: `apps/web/src/state/settings-store.ts`
- Modify: `apps/web/src/state/settings-store.test.ts`

**Step 1: Write the failing tests**

新增运行时解析 helper 测试，把最容易回归的逻辑移出 store：

```ts
// apps/web/src/state/settings-runtime-resolver.test.ts
import { describe, expect, it } from "vitest";
import {
  buildCompileRuntimeOptions,
  maybeAppendDebugEvent
} from "./settings-runtime-resolver";

describe("settings-runtime-resolver", () => {
  it("builds byok runtime options and surfaces decrypt failures", async () => {
    const result = await buildCompileRuntimeOptions(input);
    expect(result.byokRuntimeIssue?.code).toBe("BYOK_KEY_DECRYPT_FAILED");
  });

  it("only appends debug events when debugLogPanelEnabled is on", () => {
    expect(maybeAppendDebugEvent(state, event)).toEqual([event]);
  });
});
```

`apps/web/src/state/settings-store.test.ts` 保留 store API 回归，只验证 store 仍然正确调用 helper 并更新状态。

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --run --project @geohelper/web apps/web/src/state/settings-runtime-resolver.test.ts apps/web/src/state/settings-store.test.ts`

Expected: FAIL because the helper module does not exist yet.

**Step 3: Write minimal implementation**

拆出两个模块：

```ts
// apps/web/src/state/settings-runtime-resolver.ts
export const buildCompileRuntimeOptions = async (input: {
  state: SettingsStoreState;
  conversationId: string;
  mode: ChatMode;
  secretService: SecretService;
}) => {
  // move resolveCompileRuntimeOptions logic here
};

export const maybeAppendDebugEvent = (
  state: SettingsStoreState,
  event: { level: "info" | "error"; message: string }
) => {
  // return next event list instead of mutating store directly
};
```

```ts
// apps/web/src/state/settings-persistence.ts
export const loadSettingsSnapshot = (): PersistedSettingsSnapshot => {
  // move localStorage parsing / fallback normalization here
};

export const saveSettingsSnapshot = (snapshot: PersistedSettingsSnapshot): void => {
  // move persistSettingsSnapshotToIndexedDb glue here
};
```

`apps/web/src/state/settings-store.ts` 只保留：

1. state shape
2. action wiring
3. store-local UI state (`drawerOpen`, `byokRuntimeIssue`, `remoteBackupSync`)
4. calls into persistence/runtime helpers

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --run --project @geohelper/web apps/web/src/state/settings-runtime-resolver.test.ts apps/web/src/state/settings-store.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/state/settings-store.ts \
  apps/web/src/state/settings-persistence.ts \
  apps/web/src/state/settings-runtime-resolver.ts \
  apps/web/src/state/settings-runtime-resolver.test.ts \
  apps/web/src/state/settings-store.test.ts
git commit -m "refactor: extract settings runtime and persistence helpers"
```

---

### Task 4: Extract Chat Snapshot Persistence and Send Pipeline

**Files:**
- Create: `apps/web/src/state/chat-persistence.ts`
- Create: `apps/web/src/state/chat-send-flow.ts`
- Create: `apps/web/src/state/chat-send-flow.test.ts`
- Modify: `apps/web/src/state/chat-store.ts`
- Modify: `apps/web/src/state/chat-store.test.ts`

**Step 1: Write the failing tests**

新增 pipeline 级测试，把聊天发送中的纯逻辑从 store 本体移开：

```ts
// apps/web/src/state/chat-send-flow.test.ts
import { describe, expect, it } from "vitest";
import {
  buildCompileContext,
  resolveChatSendGuard,
  buildAssistantMessageFromCompileResult
} from "./chat-send-flow";

describe("chat-send-flow", () => {
  it("builds recentMessages and sceneTransactions context", () => {
    expect(buildCompileContext(input).recentMessages).toHaveLength(2);
  });

  it("returns official-mode guard when runtime lacks official auth", () => {
    expect(resolveChatSendGuard(input)?.kind).toBe("official_unsupported");
  });
});
```

`apps/web/src/state/chat-store.test.ts` 保留现有回归断言，但把 compile context、guard 分支、assistant message 生成这些断言逐步转到新 helper 测试里。

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --run --project @geohelper/web apps/web/src/state/chat-send-flow.test.ts apps/web/src/state/chat-store.test.ts`

Expected: FAIL because the helper module does not exist yet.

**Step 3: Write minimal implementation**

```ts
// apps/web/src/state/chat-persistence.ts
export const loadChatSnapshot = (): PersistedChatSnapshot => {
  // move localStorage parsing / fallback conversation creation here
};

export const saveChatSnapshot = (snapshot: PersistedChatSnapshot): void => {
  // move persistChatSnapshotToIndexedDb glue here
};
```

```ts
// apps/web/src/state/chat-send-flow.ts
export const buildCompileContext = (input: {
  conversation: ConversationThread | undefined;
  sceneTransactions: SceneTransaction[];
}) => {
  // move recentMessages and sceneTransactions shaping here
};

export const resolveChatSendGuard = (input: {
  mode: ChatMode;
  runtime: CompileRuntimeOptions;
  attachments: ChatAttachment[];
}) => {
  // return official_unsupported / attachments_unsupported / byok_key_unavailable / null
};
```

`apps/web/src/state/chat-store.ts` 保留 store action 和 state mutation，但把下列逻辑改为 helper 调用：

1. load/save snapshot
2. compile context shaping
3. runtime guard branch resolution
4. assistant message construction for success and failure

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --run --project @geohelper/web apps/web/src/state/chat-send-flow.test.ts apps/web/src/state/chat-store.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/state/chat-store.ts \
  apps/web/src/state/chat-persistence.ts \
  apps/web/src/state/chat-send-flow.ts \
  apps/web/src/state/chat-send-flow.test.ts \
  apps/web/src/state/chat-store.test.ts
git commit -m "refactor: extract chat send pipeline helpers"
```

---

### Task 5: Thin SettingsDrawer and WorkspaceShell, and Eliminate the Build Warning

**Files:**
- Create: `apps/web/src/components/settings-drawer/useRemoteBackupControls.ts`
- Create: `apps/web/src/components/workspace-shell/useWorkspaceRuntimeSession.ts`
- Create: `apps/web/src/components/workspace-shell/useWorkspaceComposer.ts`
- Modify: `apps/web/src/components/SettingsDrawer.tsx`
- Modify: `apps/web/src/components/WorkspaceShell.tsx`
- Modify: `apps/web/src/components/settings-remote-backup.ts`
- Modify: `apps/web/src/components/settings-remote-backup.test.ts`
- Modify: `tests/workspace/component-extraction.test.ts`
- Modify: `docs/architecture/maintainability-baseline.md`

**Step 1: Write the failing tests**

先把结构目标写成守门测试：

```ts
// tests/workspace/component-extraction.test.ts
expect(settingsDrawer).toContain("./settings-drawer/useRemoteBackupControls");
expect(settingsDrawer).not.toContain("../storage/backup");
expect(workspaceShell).toContain("./workspace-shell/useWorkspaceRuntimeSession");
expect(workspaceShell).toContain("./workspace-shell/useWorkspaceComposer");
expect(countLines("apps/web/src/components/WorkspaceShell.tsx")).toBeLessThan(850);
expect(countLines("apps/web/src/components/SettingsDrawer.tsx")).toBeLessThan(1400);
```

同时把基线文档中的 build warning 状态改成“待消除”，使本任务完成后必须同步文档。

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --run tests/workspace/component-extraction.test.ts`

Expected: FAIL because the current shell components still contain direct orchestration and line counts remain too高.

**Step 3: Write minimal implementation**

拆出两个 controller hook：

```ts
// apps/web/src/components/settings-drawer/useRemoteBackupControls.ts
export const useRemoteBackupControls = (input: {
  activeConversationId: string | null;
  currentMode: ChatMode;
}) => {
  // own pull/push/restore/import handlers
  // lazily import ../storage/backup inside action handlers
  // lazily call runtime-service upload/download helpers here, not in SettingsDrawer.tsx
};
```

```ts
// apps/web/src/components/workspace-shell/useWorkspaceRuntimeSession.ts
export const useWorkspaceRuntimeSession = () => {
  // own mode switching, token dialog, login/revoke session workflow
};
```

```ts
// apps/web/src/components/workspace-shell/useWorkspaceComposer.ts
export const useWorkspaceComposer = () => {
  // own draft, attachment parsing, slash command menu, submit handlers
};
```

目标：

1. `SettingsDrawer.tsx` 只消费 presentation data 和 controller callbacks。
2. `WorkspaceShell.tsx` 只做布局、selector wiring、child component assembly。
3. `settings-remote-backup.ts` 保持 presentation-only，不再承接 runtime side effects。
4. 由于 `backup.ts` 不再被 `SettingsDrawer.tsx` 静态导入，现有 Vite warning 应消失。

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --run tests/workspace/component-extraction.test.ts apps/web/src/components/settings-remote-backup.test.ts`

Expected: PASS

Then verify the build warning is gone:

Run: `BUILD_LOG=$(mktemp -t geohelper-phase2-build.XXXXXX) && pnpm build:web 2>&1 | tee "$BUILD_LOG" && BUILD_WARNING_LOG="$BUILD_LOG" BUILD_WARNING_BASELINE="docs/architecture/maintainability-baseline.md" pnpm quality:build-warnings`

Expected: PASS with `No actionable build warnings detected.`

**Step 5: Commit**

```bash
git add apps/web/src/components/SettingsDrawer.tsx \
  apps/web/src/components/WorkspaceShell.tsx \
  apps/web/src/components/settings-remote-backup.ts \
  apps/web/src/components/settings-drawer/useRemoteBackupControls.ts \
  apps/web/src/components/workspace-shell/useWorkspaceRuntimeSession.ts \
  apps/web/src/components/workspace-shell/useWorkspaceComposer.ts \
  apps/web/src/components/settings-remote-backup.test.ts \
  tests/workspace/component-extraction.test.ts \
  docs/architecture/maintainability-baseline.md
git commit -m "refactor: thin settings and workspace shell controllers"
```

---

### Task 6: Tighten Architecture Budgets and State/Storage Boundary Rules

**Files:**
- Create: `tests/workspace/state-storage-boundaries.test.ts`
- Modify: `tests/workspace/architecture-budgets.test.ts`
- Modify: `tests/workspace/architecture-verify.test.ts`
- Modify: `docs/architecture/dependency-rules.md`
- Modify: `docs/architecture/maintainability-baseline.md`

**Step 1: Write the failing tests**

新增 workspace 测试，把本轮拆分结果固化下来：

```ts
// tests/workspace/state-storage-boundaries.test.ts
import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("state/storage boundaries", () => {
  it("keeps shell components from directly importing storage facades", () => {
    const settingsDrawer = fs.readFileSync("apps/web/src/components/SettingsDrawer.tsx", "utf8");
    expect(settingsDrawer).not.toContain("../storage/backup");
    expect(settingsDrawer).not.toContain("../runtime/runtime-service");
  });

  it("keeps stores delegating to helper modules", () => {
    const settingsStore = fs.readFileSync("apps/web/src/state/settings-store.ts", "utf8");
    expect(settingsStore).toContain("./settings-runtime-resolver");
    const chatStore = fs.readFileSync("apps/web/src/state/chat-store.ts", "utf8");
    expect(chatStore).toContain("./chat-send-flow");
  });
});
```

同步收紧预算：

1. `SettingsDrawer.tsx < 1400`
2. `WorkspaceShell.tsx < 850`
3. `settings-store.ts < 950`
4. `chat-store.ts < 700`
5. `backup.ts < 450`
6. `remote-sync.ts < 320`

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --run tests/workspace/state-storage-boundaries.test.ts tests/workspace/architecture-budgets.test.ts tests/workspace/architecture-verify.test.ts`

Expected: FAIL until docs and thresholds are updated to match the new structure.

**Step 3: Write minimal implementation**

更新文档与测试基线：

1. `docs/architecture/dependency-rules.md` 增加 Web 内部规则：
   - `components/` 不直接导入 `storage/backup.ts`
   - `shell components` 通过 controller hooks 间接访问 runtime side effects
   - `state/*-store.ts` 优先依赖 `*-persistence.ts` 和 `*-resolver.ts`
2. `docs/architecture/maintainability-baseline.md` 记录 Wave 2 后的新热点与已清除的 build warning。
3. `tests/workspace/architecture-budgets.test.ts` 同步新预算。
4. `tests/workspace/architecture-verify.test.ts` 保留 `verify:architecture` 作为统一入口，并改为断言 baseline 中已不再把旧 warning 记作“当前问题”。

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --run tests/workspace/state-storage-boundaries.test.ts tests/workspace/architecture-budgets.test.ts tests/workspace/architecture-verify.test.ts`

Expected: PASS

Then run the full project verification:

Run: `pnpm verify:architecture`

Expected: PASS

**Step 5: Commit**

```bash
git add tests/workspace/state-storage-boundaries.test.ts \
  tests/workspace/architecture-budgets.test.ts \
  tests/workspace/architecture-verify.test.ts \
  docs/architecture/dependency-rules.md \
  docs/architecture/maintainability-baseline.md
git commit -m "test: lock web state and storage architecture boundaries"
```

---

## Exit Criteria

本计划完成时，应重新检查以下结果：

1. `pnpm verify:architecture` 通过。
2. `apps/web/src/storage/backup.ts` 与 `apps/web/src/storage/remote-sync.ts` 明显缩短，主要承担 facade / controller wiring。
3. `apps/web/src/state/settings-store.ts` 与 `apps/web/src/state/chat-store.ts` 的主要复杂逻辑已迁出。
4. `apps/web/src/components/SettingsDrawer.tsx` 不再静态导入 `../storage/backup`。
5. `pnpm build:web` 不再触发当前 baseline 中记录的 actionable warning。

## Risks to Watch

1. 远端同步与导入回滚共享同一批本地 snapshot，拆分时最容易出现“helper 切开了，状态同步顺序变了”的回归。
2. `settings-store.ts` 同时管理 secret 解密、runtime capability hydration、remote sync status，拆分时不要把 store-local UI state 一起过度抽走。
3. `chat-store.ts` 的 compile context 和 retry 分支测试较多，迁移时优先保持公开 API 不变，再考虑进一步瘦身。
4. `SettingsDrawer.tsx` 的 build warning 消除依赖“去掉静态 import”，不要只是把逻辑搬文件但仍在顶层直接 import `backup.ts`。

## Recommended Execution Order

1. Task 1
2. Task 2
3. Task 3
4. Task 4
5. Task 5
6. Task 6

