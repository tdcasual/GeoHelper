# Web Test Maintainability Phase 5 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在不改变现有 Web 运行时、设置、备份与网关交互行为的前提下，拆分当前 3 个超大的测试文件，并把 `--include-tests` 热点报告升级成真正能持续暴露测试维护性回潮的护栏。

**Architecture:** Phase 5 延续前几轮“先让超大文件退化成薄入口，再把按领域聚合的断言迁移到 focused suite”的路线。测试层只做结构化拆分，不改生产实现语义；质量护栏层则把此前只对少数测试路径生效的 budget 映射补齐，让 `state`、`storage`、`runtime`、`gateway` 等测试文件都能在 include-tests 模式下被一致归类。

**Tech Stack:** TypeScript, Vitest, pnpm, Vite workspace scripts, Node.js quality tooling

---

## Phase 5 Scope

本阶段只处理测试可维护性与测试热点可见性，不进入新的产品功能，不改 Gateway/Protocol 行为，不重写断言语义，也不调整现有业务模块导出。

当前主要测试热点：

1. `apps/web/src/state/settings-store.test.ts` (`742`)
2. `apps/web/src/storage/backup.test.ts` (`1037`)
3. `apps/web/src/runtime/gateway-client.test.ts` (`935`)

本阶段完成后应满足：

1. `settings-store.test.ts` 退化为薄 facade / wiring suite，加密存储、运行时能力、远端同步状态流转迁移到独立测试文件。
2. `backup.test.ts` 退化为薄整合入口，envelope、merge/import、rollback anchor、remote envelope 等断言迁移到独立测试文件。
3. `gateway-client.test.ts` 退化为薄 transport / facade suite，compile、backup routes、history metadata、guarded upload 等断言迁移到独立测试文件。
4. `node scripts/quality/report-hotspots.mjs --include-tests` 能稳定暴露 `state`、`storage`、`runtime`、`gateway` 等目录下的超大测试文件。
5. `tests/workspace/architecture-budgets.test.ts` 与 baseline 文档固化本轮新的 include-tests guardrail。

---

### Task 1: Split Settings Store Tests Into Focused Suites

**Files:**
- Create: `apps/web/src/state/settings-store.secrets.test.ts`
- Create: `apps/web/src/state/settings-store.runtime.test.ts`
- Create: `apps/web/src/state/settings-store.remote-sync.test.ts`
- Modify: `apps/web/src/state/settings-store.test.ts`

**Step 1: Write the failing test**

先在薄入口套件里把目标边界写死：

```ts
// apps/web/src/state/settings-store.test.ts
import { describe, expect, it } from "vitest";

describe("settings-store facade", () => {
  it("stays below the thin-suite budget", async () => {
    const { readFile } = await import("node:fs/promises");
    const code = await readFile(new URL("./settings-store.test.ts", import.meta.url), "utf8");
    expect(code.split(/\r?\n/).length).toBeLessThan(260);
  });
});
```

再在新的 focused suites 中迁移现有断言并补至少 1 条“文件不存在时应该失败”的 red case，例如：

```ts
// apps/web/src/state/settings-store.runtime.test.ts
it("resolves runtime compile options with hydrated gateway capabilities", async () => {
  // 从旧文件迁移现有 runtime capability / gateway hydration 断言
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --run apps/web/src/state/settings-store.test.ts apps/web/src/state/settings-store.runtime.test.ts apps/web/src/state/settings-store.remote-sync.test.ts apps/web/src/state/settings-store.secrets.test.ts`

Expected: FAIL because the new split files do not exist yet, and the original monolithic suite is still over the thin-suite budget.

**Step 3: Write minimal implementation**

把原有测试按领域迁移：

1. `settings-store.secrets.test.ts`: BYOK preset encryption、admin token encrypt/decrypt/clear
2. `settings-store.runtime.test.ts`: runtime default profile、vision inference、compile runtime facade、`process.env` guard
3. `settings-store.remote-sync.test.ts`: lightweight sync mode persistence、compare result states、guarded upload states、snapshot update
4. `settings-store.test.ts`: 只保留少量 facade / smoke / shared helper 断言

允许提取文件内公用 helper（例如 memory storage / remote summary builders），但不要引入新的共享测试库。

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --run apps/web/src/state/settings-store.test.ts apps/web/src/state/settings-store.runtime.test.ts apps/web/src/state/settings-store.remote-sync.test.ts apps/web/src/state/settings-store.secrets.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/state/settings-store.test.ts \
  apps/web/src/state/settings-store.secrets.test.ts \
  apps/web/src/state/settings-store.runtime.test.ts \
  apps/web/src/state/settings-store.remote-sync.test.ts
git commit -m "test: split settings store suites"
```

---

### Task 2: Ratchet Include-Tests Hotspot Reporting

**Files:**
- Modify: `scripts/quality/report-hotspots.mjs`
- Modify: `tests/workspace/architecture-budgets.test.ts`
- Modify: `docs/architecture/maintainability-baseline.md`

**Step 1: Write the failing test**

在 architecture budget test 里先把 include-tests 预期写死：

```ts
const includeTestHotspots = reportModule.collectHotspots({
  cwd: process.cwd(),
  budgets,
  includeTests: true
});
const includePaths = includeTestHotspots.map((item: { filePath: string }) => item.filePath);

expect(includePaths).not.toContain("apps/web/src/state/settings-store.test.ts");
expect(includePaths).toContain("apps/web/src/storage/backup.test.ts");
expect(includePaths).toContain("apps/web/src/runtime/gateway-client.test.ts");
```

如需新增 test budget 配置，也先在测试中锁定：

```ts
expect(budgets.maxTestLines).toBe(600);
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --run tests/workspace/architecture-budgets.test.ts`

Expected: FAIL because current include-tests classification still misses several `storage` / `runtime` / `gateway` test suites.

**Step 3: Write minimal implementation**

更新 `report-hotspots.mjs`：

1. 让 `loadBudgetConfig()` 支持明确的 test budget（如果实现时判断更适合复用 store/component/style budget，也要在测试里锁死映射）
2. 扩展 `resolveBudgetCategory()`，保证 `state`、`storage`、`runtime`、`gateway` 等测试文件在 include-tests 模式下都能归入稳定预算分类
3. 保持默认报告继续忽略测试，只有 `--include-tests` 时才启用测试热点

同步更新 baseline 文档，记录新的 include-tests 可见性与当前已知热点/恢复状态。

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --run tests/workspace/architecture-budgets.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add scripts/quality/report-hotspots.mjs \
  tests/workspace/architecture-budgets.test.ts \
  docs/architecture/maintainability-baseline.md
git commit -m "test: ratchet include-tests hotspot reporting"
```

---

### Task 3: Split Backup Storage Tests Into Focused Suites

**Files:**
- Create: `apps/web/src/storage/backup.envelope.test.ts`
- Create: `apps/web/src/storage/backup.import.test.ts`
- Create: `apps/web/src/storage/backup.rollback.test.ts`
- Create: `apps/web/src/storage/backup.remote.test.ts`
- Modify: `apps/web/src/storage/backup.test.ts`

**Step 1: Write the failing test**

在薄入口套件中加 line-budget 断言，并把新套件命令列出来：

```ts
it("keeps the backup facade suite below budget", async () => {
  const { readFile } = await import("node:fs/promises");
  const code = await readFile(new URL("./backup.test.ts", import.meta.url), "utf8");
  expect(code.split(/\r?\n/).length).toBeLessThan(260);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --run apps/web/src/storage/backup.test.ts apps/web/src/storage/backup.envelope.test.ts apps/web/src/storage/backup.import.test.ts apps/web/src/storage/backup.rollback.test.ts apps/web/src/storage/backup.remote.test.ts`

Expected: FAIL because the new files do not exist yet and the original file is still monolithic.

**Step 3: Write minimal implementation**

按主题迁移现有断言：

1. `backup.envelope.test.ts`: snapshot/envelope serialization
2. `backup.import.test.ts`: local import / merge / overwrite semantics
3. `backup.rollback.test.ts`: rollback anchor capture/restore behavior
4. `backup.remote.test.ts`: remote backup envelope import / scene sync specifics
5. `backup.test.ts`: 保留少量跨模块 smoke/facade coverage

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --run apps/web/src/storage/backup.test.ts apps/web/src/storage/backup.envelope.test.ts apps/web/src/storage/backup.import.test.ts apps/web/src/storage/backup.rollback.test.ts apps/web/src/storage/backup.remote.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/storage/backup.test.ts \
  apps/web/src/storage/backup.envelope.test.ts \
  apps/web/src/storage/backup.import.test.ts \
  apps/web/src/storage/backup.rollback.test.ts \
  apps/web/src/storage/backup.remote.test.ts
git commit -m "test: split backup storage suites"
```

---

### Task 4: Split Gateway Client Tests Into Focused Suites

**Files:**
- Create: `apps/web/src/runtime/gateway-client.compile.test.ts`
- Create: `apps/web/src/runtime/gateway-client.backup.test.ts`
- Create: `apps/web/src/runtime/gateway-client.history.test.ts`
- Modify: `apps/web/src/runtime/gateway-client.test.ts`

**Step 1: Write the failing test**

为薄入口 suite 增加 budget 断言：

```ts
it("keeps the gateway client facade suite below budget", async () => {
  const { readFile } = await import("node:fs/promises");
  const code = await readFile(new URL("./gateway-client.test.ts", import.meta.url), "utf8");
  expect(code.split(/\r?\n/).length).toBeLessThan(260);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --run apps/web/src/runtime/gateway-client.test.ts apps/web/src/runtime/gateway-client.compile.test.ts apps/web/src/runtime/gateway-client.backup.test.ts apps/web/src/runtime/gateway-client.history.test.ts`

Expected: FAIL because the new split suites do not exist yet and the original file is still above budget.

**Step 3: Write minimal implementation**

按 transport 领域拆分：

1. `gateway-client.compile.test.ts`: compile/auth/capability routes
2. `gateway-client.backup.test.ts`: upload/download/list remote backup routes
3. `gateway-client.history.test.ts`: history metadata、guarded upload、selected snapshot helpers
4. `gateway-client.test.ts`: 保留 shared smoke / client construction / cross-route facade wiring

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --run apps/web/src/runtime/gateway-client.test.ts apps/web/src/runtime/gateway-client.compile.test.ts apps/web/src/runtime/gateway-client.backup.test.ts apps/web/src/runtime/gateway-client.history.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/runtime/gateway-client.test.ts \
  apps/web/src/runtime/gateway-client.compile.test.ts \
  apps/web/src/runtime/gateway-client.backup.test.ts \
  apps/web/src/runtime/gateway-client.history.test.ts
git commit -m "test: split gateway client suites"
```

---

### Task 5: Full Verification And Baseline Refresh

**Files:**
- Modify as needed from Tasks 1-4 only

**Step 1: Run targeted hotspot report**

Run: `node scripts/quality/report-hotspots.mjs --include-tests`

Expected: Only still-unfinished test hotspots appear; completed suites should no longer exceed budget.

**Step 2: Run full architecture verification**

Run: `pnpm verify:architecture`

Expected: PASS with lint, depcruise, typecheck, tests, build, and build warning checks all green.

**Step 3: Record skill usage before any commit that closes the phase**

Append an audit JSON line to `~/.codex/memory/skill-audit.jsonl` describing invoked, missed, or drifted skills for Phase 5.

**Step 4: Final commit**

```bash
git add apps/web/src/state/*.test.ts \
  apps/web/src/storage/*.test.ts \
  apps/web/src/runtime/*.test.ts \
  scripts/quality/report-hotspots.mjs \
  tests/workspace/architecture-budgets.test.ts \
  docs/architecture/maintainability-baseline.md \
  docs/plans/2026-03-16-web-test-maintainability-phase5-implementation-plan.md
git commit -m "test: ratchet web test maintainability guardrails"
```
