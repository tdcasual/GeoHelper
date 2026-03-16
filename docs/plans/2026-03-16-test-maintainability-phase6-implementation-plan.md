# Test Maintainability Phase 6 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 继续清理 `--include-tests` 热点报告中剩余的超大测试文件，优先拆分 Gateway 侧 backup suite，再评估和推进 e2e 场景拆分。

**Architecture:** Phase 6 延续 Phase 5 已验证的薄入口策略：让超大测试文件退化为 facade/smoke suite，把按路由、状态流、用户路径聚合的断言迁移到 focused suites。Gateway 测试优先按 API 能力与错误分支拆开；e2e 测试则优先按主要用户流拆成独立 spec，避免单个 spec 承担过多 unrelated 场景。

**Tech Stack:** TypeScript, Vitest, Playwright, pnpm, Node.js quality scripts

---

## Phase 6 Scope

本阶段只处理 include-tests 仍然暴露的测试热点，不改生产实现语义，不新增产品功能，不调整协议字段，也不改变现有接口行为。

当前剩余热点：

1. `tests/e2e/settings-drawer.spec.ts`
2. `apps/gateway/test/admin-backups.test.ts`
3. `tests/e2e/fullscreen-toggle.spec.ts`
4. `apps/gateway/test/redis-backup-store.test.ts`

本阶段完成后应满足：

1. `admin-backups.test.ts` 退化为薄 admin backup facade suite，latest/history/protect/guarded/error-path 迁移到 focused suites。
2. `redis-backup-store.test.ts` 退化为薄 store facade suite，put/get/history/protection/limit behavior 迁移到 focused suites。
3. e2e 大 spec 至少完成边界评估并开始按用户路径拆分，必要时同步更新 hotspot guardrail tests 与 baseline。
4. `node scripts/quality/report-hotspots.mjs --include-tests` 继续只报告尚未完成的真正热点。

---

### Task 1: Split Gateway Admin Backup Route Tests

**Files:**
- Create: `apps/gateway/test/admin-backups.latest.test.ts`
- Create: `apps/gateway/test/admin-backups.history.test.ts`
- Create: `apps/gateway/test/admin-backups.guarded.test.ts`
- Modify: `apps/gateway/test/admin-backups.test.ts`
- Modify: `tests/workspace/architecture-budgets.test.ts`
- Modify: `docs/architecture/maintainability-baseline.md`

**Step 1: Write the failing test**

先把薄入口预算锁死：

```ts
// apps/gateway/test/admin-backups.test.ts
it("keeps the admin backups facade suite below the test maintainability budget", async () => {
  const { readFile } = await import("node:fs/promises");
  const code = await readFile(new URL("./admin-backups.test.ts", import.meta.url), "utf8");
  expect(code.split(/\r?\n/).length).toBeLessThan(260);
});
```

同步在 workspace guardrail 里锁定：

```ts
expect(includeTestHotspotPaths).not.toContain("apps/gateway/test/admin-backups.test.ts");
expect(countLines("apps/gateway/test/admin-backups.test.ts")).toBeLessThan(260);
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --run apps/gateway/test/admin-backups.test.ts tests/workspace/architecture-budgets.test.ts`

Expected: FAIL because `admin-backups.test.ts` 仍然超预算并仍出现在 include-tests 热点列表。

**Step 3: Write minimal implementation**

按路由/领域拆分：

1. `admin-backups.latest.test.ts`: latest upload/download happy path
2. `admin-backups.history.test.ts`: history listing, selected snapshot, protect/unprotect
3. `admin-backups.guarded.test.ts`: compare/guarded upload/conflict/auth failure
4. `admin-backups.test.ts`: 只保留少量 facade smoke 和 thin-suite budget assertion

若有重复的 app/bootstrap helper，可抽到本目录的 test helper 文件，但避免引入过度共享层。

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --run apps/gateway/test/admin-backups.test.ts apps/gateway/test/admin-backups.latest.test.ts apps/gateway/test/admin-backups.history.test.ts apps/gateway/test/admin-backups.guarded.test.ts tests/workspace/architecture-budgets.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/gateway/test/admin-backups.test.ts \
  apps/gateway/test/admin-backups.latest.test.ts \
  apps/gateway/test/admin-backups.history.test.ts \
  apps/gateway/test/admin-backups.guarded.test.ts \
  tests/workspace/architecture-budgets.test.ts \
  docs/architecture/maintainability-baseline.md
git commit -m "test: split gateway admin backup suites"
```

---

### Task 2: Split Redis Backup Store Tests

**Files:**
- Create: `apps/gateway/test/redis-backup-store.latest.test.ts`
- Create: `apps/gateway/test/redis-backup-store.history.test.ts`
- Create: `apps/gateway/test/redis-backup-store.protection.test.ts`
- Modify: `apps/gateway/test/redis-backup-store.test.ts`
- Modify: `tests/workspace/architecture-budgets.test.ts`
- Modify: `docs/architecture/maintainability-baseline.md`

**Step 1: Write the failing test**

```ts
it("keeps the redis backup store facade suite below the test maintainability budget", async () => {
  const { readFile } = await import("node:fs/promises");
  const code = await readFile(new URL("./redis-backup-store.test.ts", import.meta.url), "utf8");
  expect(code.split(/\r?\n/).length).toBeLessThan(260);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --run apps/gateway/test/redis-backup-store.test.ts`

Expected: FAIL because the file still aggregates all store behavior.

**Step 3: Write minimal implementation**

1. `redis-backup-store.latest.test.ts`: put/get latest snapshot behavior
2. `redis-backup-store.history.test.ts`: history ordering, lookup, retention semantics
3. `redis-backup-store.protection.test.ts`: protect/unprotect and protected-count limit behavior
4. `redis-backup-store.test.ts`: 保留少量 store construction / smoke coverage

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --run apps/gateway/test/redis-backup-store.test.ts apps/gateway/test/redis-backup-store.latest.test.ts apps/gateway/test/redis-backup-store.history.test.ts apps/gateway/test/redis-backup-store.protection.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/gateway/test/redis-backup-store.test.ts \
  apps/gateway/test/redis-backup-store.latest.test.ts \
  apps/gateway/test/redis-backup-store.history.test.ts \
  apps/gateway/test/redis-backup-store.protection.test.ts
git commit -m "test: split redis backup store suites"
```

---

### Task 3: Split Settings Drawer E2E Spec By User Flow

**Files:**
- Create: `tests/e2e/settings-drawer.general.spec.ts`
- Create: `tests/e2e/settings-drawer.backup.spec.ts`
- Create: `tests/e2e/settings-drawer.rollback.spec.ts`
- Create: `tests/e2e/settings-drawer.remote-sync.spec.ts`
- Create: `tests/e2e/settings-drawer.remote-import.spec.ts`
- Create: `tests/e2e/settings-drawer.remote-history.spec.ts`
- Create: `tests/e2e/settings-drawer.remote-protection.spec.ts`
- Create: `tests/e2e/settings-drawer.test-helpers.ts`
- Modify: `tests/e2e/settings-drawer.spec.ts`
- Modify: `tests/workspace/architecture-budgets.test.ts`
- Modify: `docs/architecture/maintainability-baseline.md`

**Step 1: Write the failing test**

```ts
it("keeps the settings drawer e2e facade spec below the test maintainability budget", async () => {
  const { readFile } = await import("node:fs/promises");
  const code = await readFile(new URL("../../tests/e2e/settings-drawer.spec.ts", import.meta.url), "utf8");
  expect(code.split(/\r?\n/).length).toBeLessThan(260);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --run tests/workspace/architecture-budgets.test.ts`

Expected: FAIL because the current e2e spec remains over budget and still appears in include-tests hotspots.

**Step 3: Write minimal implementation**

按用户流拆分：

1. general settings / model / compact layout flow
2. local backup / import flow
3. local rollback / overwrite guard flow
4. remote backup sync / guarded upload flow
5. remote import rollback / overwrite flow
6. remote history preview flow
7. remote protection / protected-capacity flow

`settings-drawer.spec.ts` 仅保留最小 smoke/navigation coverage。

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --run tests/workspace/architecture-budgets.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add tests/e2e/settings-drawer*.spec.ts \
  tests/workspace/architecture-budgets.test.ts \
  docs/architecture/maintainability-baseline.md
git commit -m "test: split settings drawer e2e flows"
```

---

### Task 4: Split Fullscreen Toggle E2E Spec

**Files:**
- Create: `tests/e2e/fullscreen-toggle.desktop.spec.ts`
- Create: `tests/e2e/fullscreen-toggle.mobile-layout.spec.ts`
- Create: `tests/e2e/fullscreen-toggle.mobile-chat.spec.ts`
- Create: `tests/e2e/fullscreen-toggle.test-helpers.ts`
- Modify: `tests/e2e/fullscreen-toggle.spec.ts`
- Modify: `tests/workspace/architecture-budgets.test.ts`
- Modify: `docs/architecture/maintainability-baseline.md`

**Step 1: Write the failing test**

对 `fullscreen-toggle.spec.ts` 同步加薄入口 budget 断言，并在 include-tests 断言里锁定“不应再出现原始 monolith spec”。

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --run tests/workspace/architecture-budgets.test.ts`

Expected: FAIL because `fullscreen-toggle.spec.ts` 仍然超预算。

**Step 3: Write minimal implementation**

拆成 desktop/mobile-layout/mobile-chat flows，保留原 spec 作为 smoke shell。

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --run tests/workspace/architecture-budgets.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add tests/e2e/fullscreen-toggle*.spec.ts \
  tests/workspace/architecture-budgets.test.ts \
  docs/architecture/maintainability-baseline.md
git commit -m "test: split fullscreen toggle e2e flows"
```

---

### Task 5: Verification And Closeout

**Files:**
- Modify as needed from Tasks 1-4 only

**Step 1: Run include-tests hotspot report**

Run: `node scripts/quality/report-hotspots.mjs --include-tests`

Expected: Only unfinished hotspots remain.

**Step 2: Run full verification**

Run: `pnpm verify:architecture`

Expected: PASS

**Step 3: Record skill usage before closing or committing**

Append an audit entry to `~/.codex/memory/skill-audit.jsonl`.

**Step 4: Final commit**

```bash
git add apps/gateway/test/*.test.ts \
  tests/e2e/*.spec.ts \
  tests/workspace/architecture-budgets.test.ts \
  tests/workspace/hotspot-reporting.test.ts \
  docs/architecture/maintainability-baseline.md \
  docs/plans/2026-03-16-test-maintainability-phase6-implementation-plan.md
git commit -m "test: ratchet remaining test maintainability hotspots"
```
