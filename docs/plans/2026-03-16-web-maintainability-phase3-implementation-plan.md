# Web Maintainability Phase 3 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在不改变现有 Web 对外行为、备份协议和数据 schema 的前提下，继续拆解远端备份控制器、设置 store、全局样式和热点报告，让当前最重的维护热点回到可控边界，并为后续功能扩展预留清晰模块接口。

**Architecture:** Phase 3 延续前两轮“薄 facade + 纯 helper/slice + 聚焦测试 + 架构预算”的策略：先让 hotspot tooling 默认只看生产源码，再把 remote backup presentation、remote backup controller、settings store 和 global stylesheet 拆到按领域分层的模块中，最后用 workspace architecture tests 和 baseline 文档把新边界固化下来。对外导出名和组件调用方式尽量保持稳定，优先做内部收缩而不是行为重写。

**Tech Stack:** React 19, TypeScript, Zustand, Vitest, pnpm, Vite, CSS

---

## Phase 3 Scope

这轮只处理 Web 侧维护性和扩展性边界，不进入 Gateway API 调整，不修改 backup envelope schema，不改动现有 UI 交互语义。

本阶段完成后应满足：

1. `scripts/quality/report-hotspots.mjs` 默认忽略 `*.test.*` 和 `src/test/**`，但仍可按参数输出测试热点。
2. `apps/web/src/components/settings-drawer/useRemoteBackupControls.ts` 只保留 React state orchestration、effects 和对外返回值；上传、拉取、导入、回滚等长流程下沉到独立模块。
3. `apps/web/src/components/settings-remote-backup.ts` 退化为薄 facade 或 re-export 层；动作状态、历史比较、导入提示、同步展示拆成独立 pure helpers。
4. `apps/web/src/state/settings-store.ts` 主要负责 store creation、slice composition、顶层 exports；remote backup、preset、session/debug wiring 不再全部内联。
5. `apps/web/src/styles.css` 变成薄入口文件，具体样式按 `tokens/home/workspace/chat/settings/responsive` 分文件。
6. `pnpm verify:architecture` 能继续通过，并更准确地反映 production maintainability hotspots。

---

### Task 1: Make Hotspot Reporting Production-Source Aware

**Files:**
- Create: `tests/workspace/hotspot-reporting.test.ts`
- Modify: `scripts/quality/report-hotspots.mjs`
- Modify: `tests/workspace/architecture-budgets.test.ts`
- Modify: `docs/architecture/maintainability-baseline.md`

**Step 1: Write the failing tests**

新增一个独立的 workspace test，先把“默认不统计测试文件”的行为写死：

```ts
// tests/workspace/hotspot-reporting.test.ts
import { describe, expect, it } from "vitest";

describe("hotspot reporting", () => {
  it("excludes test files from default hotspot collection", async () => {
    const reportModule = await import("../../scripts/quality/report-hotspots.mjs");
    const hotspots = reportModule.collectHotspots({ cwd: process.cwd() });
    const hotspotPaths = hotspots.map((item: { filePath: string }) => item.filePath);

    expect(hotspotPaths).not.toContain(
      "apps/web/src/components/settings-remote-backup.test.ts"
    );
    expect(hotspotPaths).not.toContain(
      "apps/web/src/state/settings-store.test.ts"
    );
  });

  it("classifies test files separately when explicitly requested", async () => {
    const reportModule = await import("../../scripts/quality/report-hotspots.mjs");
    expect(
      reportModule.classifyFile(
        "apps/web/src/components/settings-remote-backup.test.ts"
      )
    ).toBe("test");
  });
});
```

同时更新 `tests/workspace/architecture-budgets.test.ts`，明确断言默认 hotspot report 不再把 `*.test.ts` 当成 production hotspot。

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --run tests/workspace/hotspot-reporting.test.ts tests/workspace/architecture-budgets.test.ts`

Expected: FAIL because test files are still classified as `component` / `store` and are currently included in the default hotspot list.

**Step 3: Write minimal implementation**

在 `scripts/quality/report-hotspots.mjs` 里加入 test-file 识别和可选参数，不改现有 budget 结构：

```js
const TEST_FILE_PATTERNS = [
  /\.test\.(ts|tsx|js|jsx|css)$/,
  /\.spec\.(ts|tsx|js|jsx|css)$/
];

export const isTestFile = (filePath) =>
  TEST_FILE_PATTERNS.some((pattern) => pattern.test(filePath)) ||
  filePath.includes("/src/test/");

export const classifyFile = (filePath) => {
  if (isTestFile(filePath)) {
    return "test";
  }
  if (filePath.includes("/components/")) {
    return "component";
  }
  if (filePath.includes("/state/")) {
    return "store";
  }
  if (filePath.endsWith(".css")) {
    return "style";
  }
  return "other";
};

export const collectHotspots = ({
  cwd,
  budgets = loadBudgetConfig(),
  includeTests = false
}) => {
  // skip test files unless includeTests is true
};
```

CLI 行为保持兼容，但默认输出 production-only report；增加 `--include-tests` 选项用于专项排查测试热点。`docs/architecture/maintainability-baseline.md` 需要同步写明“当前 baseline 的 hotspot 数字默认不包含测试文件”。

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --run tests/workspace/hotspot-reporting.test.ts tests/workspace/architecture-budgets.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add scripts/quality/report-hotspots.mjs \
  tests/workspace/hotspot-reporting.test.ts \
  tests/workspace/architecture-budgets.test.ts \
  docs/architecture/maintainability-baseline.md
git commit -m "refactor: exclude test files from default hotspot reports"
```

---

### Task 2: Split Remote Backup Presentation Helpers Into Domain Modules

**Files:**
- Create: `apps/web/src/components/settings-remote-backup-actions.ts`
- Create: `apps/web/src/components/settings-remote-backup-history.ts`
- Create: `apps/web/src/components/settings-remote-backup-import.ts`
- Create: `apps/web/src/components/settings-remote-backup-sync.ts`
- Create: `apps/web/src/components/settings-remote-backup-actions.test.ts`
- Create: `apps/web/src/components/settings-remote-backup-history.test.ts`
- Create: `apps/web/src/components/settings-remote-backup-import.test.ts`
- Create: `apps/web/src/components/settings-remote-backup-sync.test.ts`
- Modify: `apps/web/src/components/settings-remote-backup.ts`
- Modify: `apps/web/src/components/settings-remote-backup.test.ts`

**Step 1: Write the failing tests**

先把现有巨大的 `settings-remote-backup.test.ts` 拆成按职责聚焦的测试文件：

```ts
// apps/web/src/components/settings-remote-backup-history.test.ts
import { describe, expect, it } from "vitest";
import {
  resolveRemoteBackupHistoryBadgePresentation,
  resolveRemoteBackupHistorySelectionPresentation
} from "./settings-remote-backup-history";

describe("settings-remote-backup-history", () => {
  it("labels the selected latest snapshot correctly", () => {
    expect(
      resolveRemoteBackupHistorySelectionPresentation(backup, backup.snapshot_id)
        .statusLabel
    ).toContain("云端最新快照");
  });

  it("returns diverged badge when local and remote summaries fork", () => {
    expect(resolveRemoteBackupHistoryBadgePresentation(local, remote)?.relation).toBe(
      "diverged"
    );
  });
});
```

```ts
// apps/web/src/components/settings-remote-backup-import.test.ts
import { describe, expect, it } from "vitest";
import {
  resolveImportActionGuardPresentation,
  resolveRemoteBackupPulledConversationImpactPresentation
} from "./settings-remote-backup-import";

describe("settings-remote-backup-import", () => {
  it("warns before local replace import when rollback anchor already exists", () => {
    expect(
      resolveImportActionGuardPresentation({
        scope: "local",
        mode: "replace",
        armed: false,
        hasRollbackAnchor: true,
        anchorSourceLabel: "本地文件"
      }).warning
    ).toContain("恢复锚点");
  });

  it("summarizes merge impact by conversation delta", () => {
    expect(
      resolveRemoteBackupPulledConversationImpactPresentation(input)?.mergeSummary
    ).toContain("新增");
  });
});
```

把 `apps/web/src/components/settings-remote-backup.test.ts` 缩成 facade 回归测试，只校验旧入口仍然正确 re-export 这些 helper。

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --run apps/web/src/components/settings-remote-backup-history.test.ts apps/web/src/components/settings-remote-backup-import.test.ts apps/web/src/components/settings-remote-backup-sync.test.ts apps/web/src/components/settings-remote-backup-actions.test.ts apps/web/src/components/settings-remote-backup.test.ts`

Expected: FAIL because the new domain modules do not exist yet.

**Step 3: Write minimal implementation**

按职责切开当前 `settings-remote-backup.ts`：

```ts
// apps/web/src/components/settings-remote-backup-actions.ts
export const resolveRemoteBackupActions = (params: ResolveRemoteBackupActionsParams) => {
  // gateway profile selection + enabled/disabled reasons
};

export const formatRemoteBackupActionMessage = (...) => { ... };
export const formatRemoteBackupProtectionActionMessage = (...) => { ... };
```

```ts
// apps/web/src/components/settings-remote-backup-history.ts
export const resolveRemoteBackupHistorySelectionPresentation = (...) => { ... };
export const resolveRemoteBackupHistoryBadgePresentation = (...) => { ... };
export const resolveRemoteBackupHistoryComparisonPresentation = (...) => { ... };
```

```ts
// apps/web/src/components/settings-remote-backup-import.ts
export const resolveImportActionGuardPresentation = (...) => { ... };
export const resolveImportRollbackAnchorPresentation = (...) => { ... };
export const resolveRemoteBackupPulledConversationImpactPresentation = (...) => { ... };
```

```ts
// apps/web/src/components/settings-remote-backup-sync.ts
export const resolveRemoteBackupSyncPresentation = (...) => { ... };
export const shouldShowRemoteBackupForceUpload = (...) => { ... };
export const createComparableSummaryFromBackupEnvelope = (...) => { ... };
```

`apps/web/src/components/settings-remote-backup.ts` 只保留 type 汇总和 re-export：

```ts
export * from "./settings-remote-backup-actions";
export * from "./settings-remote-backup-history";
export * from "./settings-remote-backup-import";
export * from "./settings-remote-backup-sync";
```

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --run apps/web/src/components/settings-remote-backup-history.test.ts apps/web/src/components/settings-remote-backup-import.test.ts apps/web/src/components/settings-remote-backup-sync.test.ts apps/web/src/components/settings-remote-backup-actions.test.ts apps/web/src/components/settings-remote-backup.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/components/settings-remote-backup.ts \
  apps/web/src/components/settings-remote-backup-actions.ts \
  apps/web/src/components/settings-remote-backup-history.ts \
  apps/web/src/components/settings-remote-backup-import.ts \
  apps/web/src/components/settings-remote-backup-sync.ts \
  apps/web/src/components/settings-remote-backup.test.ts \
  apps/web/src/components/settings-remote-backup-actions.test.ts \
  apps/web/src/components/settings-remote-backup-history.test.ts \
  apps/web/src/components/settings-remote-backup-import.test.ts \
  apps/web/src/components/settings-remote-backup-sync.test.ts
git commit -m "refactor: split remote backup presentation helpers"
```

---

### Task 3: Split Remote Backup Controller Flow Out of useRemoteBackupControls

**Files:**
- Create: `apps/web/src/components/settings-drawer/remote-backup/load-backup-module.ts`
- Create: `apps/web/src/components/settings-drawer/remote-backup/derived-state.ts`
- Create: `apps/web/src/components/settings-drawer/remote-backup/import-actions.ts`
- Create: `apps/web/src/components/settings-drawer/remote-backup/sync-actions.ts`
- Create: `apps/web/src/components/settings-drawer/remote-backup/import-actions.test.ts`
- Create: `apps/web/src/components/settings-drawer/remote-backup/sync-actions.test.ts`
- Create: `apps/web/src/components/settings-drawer/remote-backup/derived-state.test.ts`
- Modify: `apps/web/src/components/settings-drawer/useRemoteBackupControls.ts`
- Modify: `tests/workspace/component-extraction.test.ts`

**Step 1: Write the failing tests**

先为将要拆出的纯流程模块补测试，并加一个新的行数守门断言：

```ts
// apps/web/src/components/settings-drawer/remote-backup/sync-actions.test.ts
import { describe, expect, it, vi } from "vitest";
import { createRemoteBackupSyncActions } from "./sync-actions";

describe("remote-backup sync actions", () => {
  it("requires force upload when remote status blocks manual overwrite", async () => {
    const setRemoteBackupSyncResult = vi.fn();
    const actions = createRemoteBackupSyncActions(deps);

    await actions.handleUploadRemoteBackup("guarded");

    expect(setRemoteBackupSyncResult).toHaveBeenCalledWith(
      expect.objectContaining({ status: "force_upload_required" })
    );
  });
});
```

```ts
// apps/web/src/components/settings-drawer/remote-backup/import-actions.test.ts
import { describe, expect, it, vi } from "vitest";
import { createRemoteBackupImportActions } from "./import-actions";

describe("remote-backup import actions", () => {
  it("captures rollback anchor before importing a local file", async () => {
    const captureCurrentAppImportRollbackAnchor = vi.fn().mockResolvedValue(anchor);
    const actions = createRemoteBackupImportActions(deps);

    await actions.handleImportBackup("merge");

    expect(captureCurrentAppImportRollbackAnchor).toHaveBeenCalled();
  });
});
```

在 `tests/workspace/component-extraction.test.ts` 中新增：

```ts
expect(
  countLines("apps/web/src/components/settings-drawer/useRemoteBackupControls.ts")
).toBeLessThan(500);
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --run apps/web/src/components/settings-drawer/remote-backup/sync-actions.test.ts apps/web/src/components/settings-drawer/remote-backup/import-actions.test.ts apps/web/src/components/settings-drawer/remote-backup/derived-state.test.ts tests/workspace/component-extraction.test.ts`

Expected: FAIL because the new helper modules do not exist yet and `useRemoteBackupControls.ts` is still well above the new line budget.

**Step 3: Write minimal implementation**

把当前 hook 中最重的流程拆为 pure helpers / action factories：

```ts
// apps/web/src/components/settings-drawer/remote-backup/load-backup-module.ts
type BackupModule = typeof import("../../../storage/backup");

let backupModulePromise: Promise<BackupModule> | null = null;

export const loadBackupModule = (): Promise<BackupModule> => {
  if (!backupModulePromise) {
    backupModulePromise = import("../../../storage/backup");
  }
  return backupModulePromise;
};
```

```ts
// apps/web/src/components/settings-drawer/remote-backup/derived-state.ts
export const buildRemoteBackupDerivedState = (input: {
  remoteBackupSync: RemoteBackupSyncState;
  remoteBackupPullResult: RemoteBackupPulledResult | null;
  selectedRemoteHistorySnapshotId: string | null;
  importRollbackAnchor: ImportRollbackAnchor | null;
  rollbackAnchorCurrentLocalEnvelope: BackupEnvelope | null;
  localMergeImportArmed: boolean;
  localReplaceImportArmed: boolean;
  remoteMergeImportArmed: boolean;
  remoteReplaceImportArmed: boolean;
}) => {
  // latest snapshot, selected history backup, preview presentations, import warnings
};
```

```ts
// apps/web/src/components/settings-drawer/remote-backup/sync-actions.ts
export const createRemoteBackupSyncActions = (deps: RemoteBackupSyncActionDeps) => ({
  handleUploadRemoteBackup: async (mode: "guarded" | "force" = "guarded") => { ... },
  handleCheckRemoteBackupSync: async () => { ... },
  handlePullRemoteBackup: async (snapshotId?: string) => { ... },
  handleToggleSelectedRemoteHistoryProtection: async () => { ... }
});
```

```ts
// apps/web/src/components/settings-drawer/remote-backup/import-actions.ts
export const createRemoteBackupImportActions = (deps: RemoteBackupImportActionDeps) => ({
  handleImportBackupSelect: async (file: File) => { ... },
  handleImportBackup: async (mode: BackupImportMode) => { ... },
  handleRestoreImportRollbackAnchor: async () => { ... },
  handleClearImportRollbackAnchor: async () => { ... },
  handleImportPulledRemoteBackup: async (mode: BackupImportMode) => { ... }
});
```

`apps/web/src/components/settings-drawer/useRemoteBackupControls.ts` 收缩为：

1. Zustand selector wiring
2. `useState` / `useEffect` 生命周期控制
3. `buildRemoteBackupDerivedState(...)`
4. `createRemoteBackupSyncActions(...)`
5. `createRemoteBackupImportActions(...)`
6. 最终 return shape 组装

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --run apps/web/src/components/settings-drawer/remote-backup/sync-actions.test.ts apps/web/src/components/settings-drawer/remote-backup/import-actions.test.ts apps/web/src/components/settings-drawer/remote-backup/derived-state.test.ts tests/workspace/component-extraction.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/components/settings-drawer/useRemoteBackupControls.ts \
  apps/web/src/components/settings-drawer/remote-backup/load-backup-module.ts \
  apps/web/src/components/settings-drawer/remote-backup/derived-state.ts \
  apps/web/src/components/settings-drawer/remote-backup/import-actions.ts \
  apps/web/src/components/settings-drawer/remote-backup/sync-actions.ts \
  apps/web/src/components/settings-drawer/remote-backup/import-actions.test.ts \
  apps/web/src/components/settings-drawer/remote-backup/sync-actions.test.ts \
  apps/web/src/components/settings-drawer/remote-backup/derived-state.test.ts \
  tests/workspace/component-extraction.test.ts
git commit -m "refactor: split remote backup controller flows"
```

---

### Task 4: Extract Settings Store Action Slices and Shrink the Facade

**Files:**
- Create: `apps/web/src/state/settings-store-slices/remote-backup.ts`
- Create: `apps/web/src/state/settings-store-slices/runtime-and-presets.ts`
- Create: `apps/web/src/state/settings-store-slices/session-and-debug.ts`
- Create: `apps/web/src/state/settings-store-slices/remote-backup.test.ts`
- Create: `apps/web/src/state/settings-store-slices/runtime-and-presets.test.ts`
- Create: `apps/web/src/state/settings-store-slices/session-and-debug.test.ts`
- Modify: `apps/web/src/state/settings-store.ts`
- Modify: `apps/web/src/state/settings-store.test.ts`
- Modify: `tests/workspace/architecture-budgets.test.ts`

**Step 1: Write the failing tests**

把 store 中最重的 wiring 从“大而全集成测试”拆到 slice 级测试：

```ts
// apps/web/src/state/settings-store-slices/remote-backup.test.ts
import { describe, expect, it } from "vitest";
import {
  applyRemoteBackupSnapshotToComparison,
  applyRemoteBackupSnapshotToHistory,
  mapComparisonResultToSyncStatus
} from "./remote-backup";

describe("settings remote backup slice", () => {
  it("maps identical comparison to up_to_date sync status", () => {
    expect(mapComparisonResultToSyncStatus("identical")).toBe("up_to_date");
  });

  it("replaces matching snapshot inside history", () => {
    expect(applyRemoteBackupSnapshotToHistory(history, updated)[0]).toEqual(updated);
  });
});
```

```ts
// apps/web/src/state/settings-store-slices/runtime-and-presets.test.ts
import { describe, expect, it } from "vitest";
import { sanitizePresetNumeric } from "./runtime-and-presets";

describe("runtime and preset slice", () => {
  it("clamps preset numeric settings to supported ranges", () => {
    expect(
      sanitizePresetNumeric({
        temperature: 9,
        maxTokens: 999999,
        timeoutMs: 10
      }).temperature
    ).toBe(2);
  });
});
```

同时在 `tests/workspace/architecture-budgets.test.ts` 中新增：

```ts
expect(countLines("apps/web/src/state/settings-store.ts")).toBeLessThan(750);
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --run apps/web/src/state/settings-store-slices/remote-backup.test.ts apps/web/src/state/settings-store-slices/runtime-and-presets.test.ts apps/web/src/state/settings-store-slices/session-and-debug.test.ts apps/web/src/state/settings-store.test.ts tests/workspace/architecture-budgets.test.ts`

Expected: FAIL because the slice files do not exist yet and `settings-store.ts` is still above the new guardrail.

**Step 3: Write minimal implementation**

用 slice builder 把 `settings-store.ts` 里的 action wiring 按领域分组：

```ts
// apps/web/src/state/settings-store-slices/remote-backup.ts
export const createInitialRemoteBackupSyncState = (): RemoteBackupSyncState => ({ ... });
export const applyRemoteBackupSnapshotToHistory = (...) => { ... };
export const applyRemoteBackupSnapshotToComparison = (...) => { ... };
export const mapComparisonResultToSyncStatus = (...) => { ... };
export const createRemoteBackupActions = (deps: SettingsActionDeps) => ({ ... });
```

```ts
// apps/web/src/state/settings-store-slices/runtime-and-presets.ts
export const clampNumber = (...) => { ... };
export const sanitizePresetNumeric = (...) => { ... };
export const createRuntimeAndPresetActions = (deps: SettingsActionDeps) => ({ ... });
```

```ts
// apps/web/src/state/settings-store-slices/session-and-debug.ts
export const createSessionAndDebugActions = (deps: SettingsActionDeps) => ({ ... });
```

`apps/web/src/state/settings-store.ts` 只保留：

1. public types
2. `createSettingsStore(...)`
3. `saveState(...)`
4. slice composition
5. top-level exports like `resolveCompileRuntimeOptions` / `appendDebugEventIfEnabled`

`apps/web/src/state/settings-store.test.ts` 缩成 integration regression，slice 细节转移到新测试文件。

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --run apps/web/src/state/settings-store-slices/remote-backup.test.ts apps/web/src/state/settings-store-slices/runtime-and-presets.test.ts apps/web/src/state/settings-store-slices/session-and-debug.test.ts apps/web/src/state/settings-store.test.ts tests/workspace/architecture-budgets.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/state/settings-store.ts \
  apps/web/src/state/settings-store.test.ts \
  apps/web/src/state/settings-store-slices/remote-backup.ts \
  apps/web/src/state/settings-store-slices/runtime-and-presets.ts \
  apps/web/src/state/settings-store-slices/session-and-debug.ts \
  apps/web/src/state/settings-store-slices/remote-backup.test.ts \
  apps/web/src/state/settings-store-slices/runtime-and-presets.test.ts \
  apps/web/src/state/settings-store-slices/session-and-debug.test.ts \
  tests/workspace/architecture-budgets.test.ts
git commit -m "refactor: extract settings store action slices"
```

---

### Task 5: Split Global Stylesheet Into Domain CSS Modules

**Files:**
- Create: `apps/web/src/styles/tokens.css`
- Create: `apps/web/src/styles/homepage.css`
- Create: `apps/web/src/styles/workspace-shell.css`
- Create: `apps/web/src/styles/chat.css`
- Create: `apps/web/src/styles/settings-drawer.css`
- Create: `apps/web/src/styles/responsive.css`
- Create: `tests/workspace/style-modularity.test.ts`
- Modify: `apps/web/src/styles.css`
- Modify: `docs/architecture/maintainability-baseline.md`

**Step 1: Write the failing tests**

先把“`styles.css` 必须退化为薄入口”的结构约束写出来：

```ts
// tests/workspace/style-modularity.test.ts
import fs from "node:fs";
import { describe, expect, it } from "vitest";

const countLines = (path: string) =>
  fs.readFileSync(path, "utf8").split(/\r?\n/).length;

describe("style modularity", () => {
  it("turns styles.css into an import hub", () => {
    const entry = fs.readFileSync("apps/web/src/styles.css", "utf8");

    expect(entry).toContain('@import "./styles/tokens.css";');
    expect(entry).toContain('@import "./styles/homepage.css";');
    expect(entry).toContain('@import "./styles/workspace-shell.css";');
    expect(entry).toContain('@import "./styles/chat.css";');
    expect(entry).toContain('@import "./styles/settings-drawer.css";');
    expect(entry).toContain('@import "./styles/responsive.css";');
    expect(countLines("apps/web/src/styles.css")).toBeLessThan(120);
  });
});
```

`docs/architecture/maintainability-baseline.md` 也先写上新的目标状态，确保本任务完成时必须同步文档。

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --run tests/workspace/style-modularity.test.ts`

Expected: FAIL because `apps/web/src/styles.css` is still the monolithic stylesheet.

**Step 3: Write minimal implementation**

保持 `apps/web/src/main.tsx` 的 import 不变，把 `styles.css` 变成稳定入口：

```css
/* apps/web/src/styles.css */
@import "./styles/tokens.css";
@import "./styles/homepage.css";
@import "./styles/workspace-shell.css";
@import "./styles/chat.css";
@import "./styles/settings-drawer.css";
@import "./styles/responsive.css";
```

新文件的职责边界建议如下：

```css
/* apps/web/src/styles/tokens.css */
:root {
  --studio-paper: #f3eee4;
  --studio-accent: #7c5b35;
  /* shared tokens only */
}
```

```css
/* apps/web/src/styles/homepage.css */
.studio-homepage { ... }
.studio-input-paper { ... }
.teacher-template-library { ... }
```

```css
/* apps/web/src/styles/workspace-shell.css */
.workspace-shell { ... }
.workspace-content { ... }
.canvas-panel { ... }
```

```css
/* apps/web/src/styles/chat.css */
.chat-panel { ... }
.chat-shell { ... }
.conversation-sidebar { ... }
.chat-composer { ... }
```

```css
/* apps/web/src/styles/settings-drawer.css */
.settings-drawer { ... }
.settings-section { ... }
.token-gate-dialog { ... }
```

```css
/* apps/web/src/styles/responsive.css */
@media (max-width: 1100px) { ... }
@media (max-width: 720px) { ... }
```

切分时只搬运现有规则，不顺手重命名 class，不引入 CSS module 或 CSS-in-JS。

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --run tests/workspace/style-modularity.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/styles.css \
  apps/web/src/styles/tokens.css \
  apps/web/src/styles/homepage.css \
  apps/web/src/styles/workspace-shell.css \
  apps/web/src/styles/chat.css \
  apps/web/src/styles/settings-drawer.css \
  apps/web/src/styles/responsive.css \
  tests/workspace/style-modularity.test.ts \
  docs/architecture/maintainability-baseline.md
git commit -m "refactor: split web styles into domain modules"
```

---

### Task 6: Ratchet Phase 3 Guardrails and Run Full Verification

**Files:**
- Modify: `tests/workspace/component-extraction.test.ts`
- Modify: `tests/workspace/architecture-budgets.test.ts`
- Modify: `scripts/quality/report-hotspots.mjs`
- Modify: `docs/architecture/maintainability-baseline.md`

**Step 1: Write the failing tests**

最后把 Phase 3 的目标边界固化成 guardrails，避免回潮：

```ts
// tests/workspace/component-extraction.test.ts
expect(
  countLines("apps/web/src/components/settings-drawer/useRemoteBackupControls.ts")
).toBeLessThan(500);
expect(countLines("apps/web/src/components/settings-remote-backup.ts")).toBeLessThan(
  120
);
```

```ts
// tests/workspace/architecture-budgets.test.ts
expect(countLines("apps/web/src/state/settings-store.ts")).toBeLessThan(750);
expect(countLines("apps/web/src/styles.css")).toBeLessThan(120);

const hotspotPaths = hotspots.map((item) => item.filePath);
expect(hotspotPaths).not.toContain("apps/web/src/styles.css");
expect(hotspotPaths).not.toContain(
  "apps/web/src/components/settings-remote-backup.test.ts"
);
```

如有必要，也同步更新 `loadBudgetConfig().requiredHotspots`，让它匹配 Phase 3 结束后仍应持续跟踪的 production hotspots，而不是已经被拆掉的旧热点。

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --run tests/workspace/component-extraction.test.ts tests/workspace/architecture-budgets.test.ts`

Expected: FAIL until all refactor outputs、line budgets and hotspot expectations are updated together.

**Step 3: Write minimal implementation**

收尾时统一对齐：

```js
// scripts/quality/report-hotspots.mjs
export const loadBudgetConfig = () => ({
  maxComponentLines: 500,
  maxStoreLines: 600,
  maxStyleLines: 700,
  requiredHotspots: [
    "apps/web/src/components/SettingsDrawer.tsx",
    "apps/web/src/components/WorkspaceShell.tsx",
    "apps/web/src/state/chat-store.ts",
    "apps/web/src/state/settings-store.ts"
  ]
});
```

`docs/architecture/maintainability-baseline.md` 要更新为 Phase 3 完成后的真实状态，至少包含：

1. 默认 hotspot report 为 production-only
2. `useRemoteBackupControls.ts < 500`
3. `settings-remote-backup.ts < 120`
4. `settings-store.ts < 750`
5. `styles.css < 120`
6. 当前仍在跟踪的 production hotspots 列表

**Step 4: Run test to verify it passes**

Run: `pnpm verify:architecture`

Expected: PASS with workspace tests green, hotspot report matching the new production-only behavior, `pnpm build:web` passing, and `pnpm quality:build-warnings` reporting no actionable warnings.

**Step 5: Commit**

```bash
git add tests/workspace/component-extraction.test.ts \
  tests/workspace/architecture-budgets.test.ts \
  scripts/quality/report-hotspots.mjs \
  docs/architecture/maintainability-baseline.md
git commit -m "test: ratchet phase 3 maintainability guardrails"
```
