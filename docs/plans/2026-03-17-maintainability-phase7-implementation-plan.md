# Maintainability Phase 7 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 补上当前 production hotspot tooling 对 runtime/storage/routes/services 的观测盲区，并把新增暴露出的最重生产模块压回预算线内，同时固化新的 line-budget 与 boundary guardrail。

**Architecture:** Phase 7 从“继续拆一个大文件”升级为“先补观测、再拆真实热点”。先把 `report-hotspots` 从仅识别 `components/state/style/test` 扩展到显式识别 `module`，覆盖 `runtime`、`storage`、`routes`、`services` 等逻辑文件；随后让 `backup-import.ts` 和 `compile.ts` 退化为薄 orchestration shell，把大段纯归一化、合并、告警与事件拼装逻辑下沉到聚焦 helper module。对外 API、路由、响应 schema 与现有交互语义保持不变。

**Tech Stack:** TypeScript, React 19, Fastify, Vitest, pnpm, Node.js quality scripts

---

## Phase 7 Scope

这轮只处理生产侧 maintainability 与 observability，不修改 protocol schema，不改 Web/Gateway 对外接口，不引入新的运行时依赖，也不改现有测试语义。

当前发现的 blind spot 与新热点：

1. `scripts/quality/report-hotspots.mjs` 当前把 `runtime/storage/routes/services` 统一归类为 `other`，因此不会进入预算判断。
2. 若引入 `module <= 500` 预算，当前会暴露出两个真实生产热点：
   - `apps/gateway/src/routes/compile.ts` (`554`)
   - `apps/web/src/storage/backup-import.ts` (`509`)
3. 下列文件会进入 under-guardrail recovery 列表，作为后续轮次候选：
   - `apps/web/src/runtime/gateway-client.ts` (`482`)
   - `apps/gateway/src/routes/admin.ts` (`468`)
   - `apps/gateway/src/services/redis-backup-store.ts` (`444`)
   - `apps/gateway/src/services/backup-store.ts` (`428`)

本阶段完成后应满足：

1. 默认 hotspot report 能识别并预算 `module` 类文件。
2. `compile.ts` 与 `backup-import.ts` 不再出现在 default production hotspot report 中。
3. `backup-import.ts` 只保留 envelope-to-snapshot orchestration，不再内联 chat/settings/template merge 细节。
4. `compile.ts` 只保留 route registration 与主控制流，不再内联上下文归一化、alert/event builder 等长 helper。
5. `pnpm verify:architecture` 继续通过，baseline 文档能反映新的 `module` 预算与恢复列表。

### Task 1: Extend Hotspot Reporting With Module Coverage

**Files:**
- Modify: `scripts/quality/report-hotspots.mjs`
- Modify: `tests/workspace/hotspot-reporting.test.ts`
- Modify: `tests/workspace/architecture-budgets.test.ts`
- Modify: `docs/architecture/maintainability-baseline.md`

**Step 1: Write the failing tests**

先把 blind spot 写死：

```ts
expect(reportModule.classifyFile("apps/web/src/runtime/gateway-client.ts")).toBe("module");
expect(reportModule.classifyFile("apps/web/src/storage/backup-import.ts")).toBe("module");
expect(reportModule.classifyFile("apps/gateway/src/routes/compile.ts")).toBe("module");
expect(reportModule.classifyFile("apps/gateway/src/services/backup-store.ts")).toBe("module");

const budgets = reportModule.loadBudgetConfig();
expect(budgets.maxModuleLines).toBe(500);

const hotspotPaths = reportModule.collectHotspots({
  cwd: process.cwd(),
  budgets
}).map((item) => item.filePath);

expect(hotspotPaths).toContain("apps/gateway/src/routes/compile.ts");
expect(hotspotPaths).toContain("apps/web/src/storage/backup-import.ts");
```

同步在 baseline 里锁定新的 budget 文案与活跃热点文案。

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --run tests/workspace/hotspot-reporting.test.ts tests/workspace/architecture-budgets.test.ts`

Expected: FAIL because these files are still classified as `other`, `maxModuleLines` does not exist yet, and the hotspot report currently misses the two real hotspots.

**Step 3: Write minimal implementation**

在 `report-hotspots.mjs` 中：

1. 引入 `maxModuleLines: 500`
2. 将 `runtime/storage/routes/services` 归类为 `module`
3. 让 `resolveBudget()` 能处理 `module`
4. 保持默认 report 仍然 production-only，只是从“看不到这些文件”变成“能看到它们”

同步更新 workspace tests 与 baseline 文案，让它们先接受 Phase 7 的中间状态：此时 default report 会正确列出 `compile.ts` 与 `backup-import.ts`。

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --run tests/workspace/hotspot-reporting.test.ts tests/workspace/architecture-budgets.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add scripts/quality/report-hotspots.mjs \
  tests/workspace/hotspot-reporting.test.ts \
  tests/workspace/architecture-budgets.test.ts \
  docs/architecture/maintainability-baseline.md
git commit -m "test: cover module maintainability hotspots"
```

### Task 2: Split Backup Import Merge Logic Into Domain Helpers

**Files:**
- Create: `apps/web/src/storage/backup-import-chat.ts`
- Create: `apps/web/src/storage/backup-import-settings.ts`
- Create: `apps/web/src/storage/backup-import-templates.ts`
- Modify: `apps/web/src/storage/backup-import.ts`
- Modify: `apps/web/src/storage/backup-import.test.ts`
- Modify: `tests/workspace/state-storage-boundaries.test.ts`
- Modify: `docs/architecture/maintainability-baseline.md`

**Step 1: Write the failing tests**

新增 boundary expectation：

```ts
const backupImport = fs.readFileSync("apps/web/src/storage/backup-import.ts", "utf8");
expect(backupImport).toContain("./backup-import-chat");
expect(backupImport).toContain("./backup-import-settings");
expect(backupImport).toContain("./backup-import-templates");
expect(countLines("apps/web/src/storage/backup-import.ts")).toBeLessThan(450);
```

现有 `apps/web/src/storage/backup-import.test.ts` 保持为行为回归测试；如有必要，补一个聚焦 helper test 验证 merge defaults 不变。

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --run apps/web/src/storage/backup-import.test.ts tests/workspace/state-storage-boundaries.test.ts`

Expected: FAIL because the helper modules do not exist and `backup-import.ts` is still over the new guardrail.

**Step 3: Write minimal implementation**

拆成三层：

1. `backup-import-chat.ts`: conversation normalization, active conversation resolution, chat merge
2. `backup-import-settings.ts`: settings/ui snapshot normalization and merge
3. `backup-import-templates.ts`: template list normalization and merge
4. `backup-import.ts`: envelope orchestration、storage reads/writes、scene snapshot handling

不要改变 `applyImportedBackupEnvelopeToStorage()` 的签名和返回值，也不要改 `syncLiveStoresAfterImport()` 的调用时机。

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --run apps/web/src/storage/backup-import.test.ts tests/workspace/state-storage-boundaries.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/storage/backup-import*.ts \
  tests/workspace/state-storage-boundaries.test.ts \
  docs/architecture/maintainability-baseline.md
git commit -m "refactor: split backup import helpers"
```

### Task 3: Split Compile Route Helpers Out Of The Fastify Route Shell

**Files:**
- Create: `apps/gateway/src/routes/compile-route-helpers.ts`
- Create: `apps/gateway/src/routes/compile-route-alerts.ts`
- Modify: `apps/gateway/src/routes/compile.ts`
- Modify: `apps/gateway/test/compile.test.ts`
- Modify: `apps/gateway/test/compile-alerting.test.ts`
- Modify: `tests/workspace/state-storage-boundaries.test.ts`
- Modify: `docs/architecture/maintainability-baseline.md`

**Step 1: Write the failing tests**

在 workspace boundary test 中锁定：

```ts
const compileRoute = fs.readFileSync("apps/gateway/src/routes/compile.ts", "utf8");
expect(compileRoute).toContain("./compile-route-helpers");
expect(compileRoute).toContain("./compile-route-alerts");
expect(countLines("apps/gateway/src/routes/compile.ts")).toBeLessThan(500);
```

保留现有 gateway compile suite 作为行为回归：

- `apps/gateway/test/compile.test.ts`
- `apps/gateway/test/compile-alerting.test.ts`
- `apps/gateway/test/compile-client-flags.test.ts`
- `apps/gateway/test/compile-guard.test.ts`

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --run apps/gateway/test/compile.test.ts apps/gateway/test/compile-alerting.test.ts apps/gateway/test/compile-client-flags.test.ts apps/gateway/test/compile-guard.test.ts tests/workspace/state-storage-boundaries.test.ts`

Expected: FAIL because the helper modules do not exist and `compile.ts` remains above the new module budget.

**Step 3: Write minimal implementation**

提取两类 helper：

1. `compile-route-helpers.ts`: context normalization, attachment metadata summary, metadata merge
2. `compile-route-alerts.ts`: compile operator alert builder, send/defer helpers

`compile.ts` 只保留：

1. dependency injection and route registration
2. request parsing / auth / rate limit main flow
3. compile success/failure control flow

不要改变现有路由路径、status code、response body 或 alert payload schema。

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --run apps/gateway/test/compile.test.ts apps/gateway/test/compile-alerting.test.ts apps/gateway/test/compile-client-flags.test.ts apps/gateway/test/compile-guard.test.ts tests/workspace/state-storage-boundaries.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/gateway/src/routes/compile*.ts \
  apps/gateway/test/compile*.test.ts \
  tests/workspace/state-storage-boundaries.test.ts \
  docs/architecture/maintainability-baseline.md
git commit -m "refactor: split compile route helpers"
```

### Task 4: Verification And Closeout

**Files:**
- Modify as needed from Tasks 1-3 only

**Step 1: Run default production hotspot report**

Run: `node scripts/quality/report-hotspots.mjs`

Expected: `No over-budget files detected.`

**Step 2: Run full verification**

Run: `pnpm verify:architecture`

Expected: PASS

**Step 3: Record skill usage before closing or committing**

Append an audit entry to `~/.codex/memory/skill-audit.jsonl`.

**Step 4: Final commit**

```bash
git add scripts/quality/report-hotspots.mjs \
  apps/web/src/storage/backup-import*.ts \
  apps/gateway/src/routes/compile*.ts \
  tests/workspace/hotspot-reporting.test.ts \
  tests/workspace/architecture-budgets.test.ts \
  tests/workspace/state-storage-boundaries.test.ts \
  docs/architecture/maintainability-baseline.md \
  docs/plans/2026-03-17-maintainability-phase7-implementation-plan.md
git commit -m "refactor: ratchet production maintainability modules"
```
