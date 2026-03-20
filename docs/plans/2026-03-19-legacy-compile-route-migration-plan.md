# GeoHelper Legacy Compile Route Migration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate all internal GeoHelper callers from `/api/v1/chat/compile` to `/api/v2/agent/runs`, then make removal of the legacy compile shell a low-risk, separately gated final cut.

**Architecture:** Treat `/api/v1/chat/compile` as a temporary compatibility adapter only. First move browser e2e fixtures, smoke/benchmark/live-model scripts, and contract docs to the `AgentRunEnvelope` contract. Only after internal callers are green and operator-facing tooling no longer depends on the legacy response shape should the gateway route itself be deprecated for removal.

**Tech Stack:** TypeScript, Fastify, React/Vite, Vitest, Playwright, Node scripts, shell smoke scripts

---

## Migration Checklist

- [x] Internal web runtime remains on `/api/v2/agent/runs` with no regression.
- [x] All internal smoke/benchmark/live-model scripts understand `agent_run`.
- [x] All browser e2e fixtures stop mocking `/api/v1/chat/compile`.
- [x] Public/API docs describe `/api/v2/agent/runs` as the primary compile contract.
- [x] `/api/v1/chat/compile` emits explicit deprecation metadata while still working.
- [ ] Operator confirms no external consumers still require `batch + agent_steps` using `docs/deploy/legacy-compile-external-consumer-checklist.md`.
- [ ] Legacy route and its adapter/tests are removed in a final clean cut.

## Current Status (2026-03-19)

Completed in this pass:

1. Runtime-adjacent scripts and smoke checks now target `POST /api/v2/agent/runs` and validate `agent_run`.
2. Browser e2e fixtures now mock `AgentRunEnvelope` via `createAgentRunPayload(...)`.
3. Public docs promote `/api/v2/agent/runs` as the primary contract and label `/api/v1/chat/compile` as legacy.
4. The legacy compile route now emits explicit deprecation headers while preserving the `batch + agent_steps` compatibility shell.

Still intentionally pending:

1. External consumer confirmation for any remaining clients that still require `batch + agent_steps`.
   Use `docs/deploy/legacy-compile-external-consumer-checklist.md`.
2. Final removal of `/api/v1/chat/compile` and its legacy adapter/tests after that confirmation.

Verification run on 2026-03-19:

```bash
pnpm test -- tests/gateway-runtime-smoke.test.ts tests/workspace/gateway-runtime-vision-smoke.test.ts tests/workspace/benchmark-runner.test.ts tests/workspace/live-model-chain.test.ts
pnpm --filter @geohelper/gateway test -- test/contract-smoke.test.ts test/compile.test.ts test/compile-client-flags.test.ts
pnpm exec playwright test tests/e2e/chat-to-render.spec.ts tests/e2e/settings-drawer.general.spec.ts tests/e2e/official-session.spec.ts tests/e2e/conversation-sidebar.spec.ts tests/e2e/studio-result-panel.spec.ts
pnpm typecheck
```

### Task 1: Migrate Operator Scripts To `AgentRunEnvelope`

**Files:**
- Modify: `scripts/smoke/gateway-runtime.mjs`
- Modify: `scripts/smoke/live-model-chain.sh`
- Modify: `scripts/bench/run-quality-benchmark.mjs`
- Test: `tests/gateway-runtime-smoke.test.ts`
- Test: `tests/workspace/gateway-runtime-vision-smoke.test.ts`
- Test: `tests/workspace/benchmark-runner.test.ts`

**Step 1: Write the failing tests**

Update script-facing tests so they expect:

1. smoke plans to hit `POST /api/v2/agent/runs`
2. live checks to validate `agent_run.run.id` and `agent_run.draft.commandBatchDraft`
3. benchmark requests to post to `/api/v2/agent/runs` and score success from `agent_run.draft.commandBatchDraft.commands`

Representative assertion target:

```ts
expect(payload.checks).toContainEqual({
  name: "POST /api/v2/agent/runs",
  method: "POST",
  path: "/api/v2/agent/runs"
});
```

**Step 2: Run tests to verify they fail**

Run:

```bash
pnpm test -- tests/gateway-runtime-smoke.test.ts tests/workspace/gateway-runtime-vision-smoke.test.ts tests/workspace/benchmark-runner.test.ts
```

Expected: FAIL because scripts still reference `/api/v1/chat/compile` and parse `batch`.

**Step 3: Write minimal implementation**

Implement the smallest possible migration:

1. Change script endpoints from `/api/v1/chat/compile` to `/api/v2/agent/runs`
2. In Node scripts, read:
   - `responseBody.agent_run.run.id`
   - `responseBody.agent_run.draft.commandBatchDraft`
   - `responseBody.agent_run.telemetry.stages`
3. In `live-model-chain.sh`, update the validation block to assert:
   - `r.agent_run` exists
   - `r.agent_run.draft.commandBatchDraft.commands` is an array
   - `r.agent_run.telemetry.stages.length >= 1`
4. Keep admin metrics / compile event checks intact; only the compile endpoint and response parsing should change

**Step 4: Run tests to verify they pass**

Run:

```bash
pnpm test -- tests/gateway-runtime-smoke.test.ts tests/workspace/gateway-runtime-vision-smoke.test.ts tests/workspace/benchmark-runner.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/smoke/gateway-runtime.mjs scripts/smoke/live-model-chain.sh scripts/bench/run-quality-benchmark.mjs tests/gateway-runtime-smoke.test.ts tests/workspace/gateway-runtime-vision-smoke.test.ts tests/workspace/benchmark-runner.test.ts
git commit -m "refactor: migrate operator scripts to agent run endpoint"
```

### Task 2: Migrate Browser E2E Fixtures Off The Legacy Compile Route

**Files:**
- Modify: `tests/e2e/chat-to-render.spec.ts`
- Modify: `tests/e2e/settings-drawer.general.spec.ts`
- Modify: `tests/e2e/official-session.spec.ts`
- Modify: `tests/e2e/conversation-sidebar.spec.ts`
- Reuse: `tests/e2e/agent-run.test-helpers.ts`

**Step 1: Write the failing tests**

Update the affected Playwright specs so they route `**/api/v2/agent/runs` and fulfill responses using the shared `createAgentRunPayload(...)` helper rather than raw `batch + agent_steps`.

Representative fixture target:

```ts
await page.route("**/api/v2/agent/runs", async (route) => {
  await route.fulfill({
    status: 200,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*"
    },
    body: JSON.stringify(
      createAgentRunPayload({
        traceId: "tr_x",
        runId: "run_x",
        summary: ["已创建三角形 ABC"]
      })
    )
  });
});
```

**Step 2: Run tests to verify they fail**

Run:

```bash
pnpm exec playwright test tests/e2e/chat-to-render.spec.ts tests/e2e/settings-drawer.general.spec.ts tests/e2e/official-session.spec.ts tests/e2e/conversation-sidebar.spec.ts
```

Expected: FAIL because the specs still intercept `/api/v1/chat/compile`.

**Step 3: Write minimal implementation**

Implement the fixture-only migration:

1. Replace all `page.route("**/api/v1/chat/compile", ...)` usages with `**/api/v2/agent/runs`
2. Replace legacy response payloads with `createAgentRunPayload(...)`
3. Keep each test's behavioral intent unchanged; only update the transport contract
4. Reuse `tests/e2e/agent-run.test-helpers.ts` instead of duplicating `agent_run` JSON shapes

**Step 4: Run tests to verify they pass**

Run:

```bash
pnpm exec playwright test tests/e2e/chat-to-render.spec.ts tests/e2e/settings-drawer.general.spec.ts tests/e2e/official-session.spec.ts tests/e2e/conversation-sidebar.spec.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add tests/e2e/chat-to-render.spec.ts tests/e2e/settings-drawer.general.spec.ts tests/e2e/official-session.spec.ts tests/e2e/conversation-sidebar.spec.ts
git commit -m "test: migrate browser e2e fixtures to agent run route"
```

### Task 3: Update Public Contract Docs To Be V2-First

**Files:**
- Modify: `docs/api/m0-m1-contract.md`
- Modify: `README.md`
- Modify: `docs/plans/2026-03-17-product-scope-reset-design.md`
- Test: `apps/gateway/test/contract-smoke.test.ts`

**Step 1: Write the failing test**

Change the doc contract test so it asserts:

1. `POST /api/v2/agent/runs` is documented
2. `AgentRunEnvelope` fields are described at least at a top-level shape
3. `/api/v1/chat/compile` is either removed from primary docs or clearly labeled deprecated / legacy-only

Representative assertion target:

```ts
expect(doc).toContain("POST /api/v2/agent/runs");
expect(doc).toContain("agent_run");
expect(doc).toContain("legacy");
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @geohelper/gateway test -- test/contract-smoke.test.ts
```

Expected: FAIL because docs still promote `/api/v1/chat/compile`.

**Step 3: Write minimal implementation**

Update docs with these rules:

1. `docs/api/m0-m1-contract.md` documents `/api/v2/agent/runs` as the primary compile API
2. `README.md` examples and runtime smoke references explain that `AgentRun` is the primary contract
3. `docs/plans/2026-03-17-product-scope-reset-design.md` keeps the legacy-shell note, but adds a migration note or sunset intent so readers do not mistake the adapter for a stable primary API

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm --filter @geohelper/gateway test -- test/contract-smoke.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add docs/api/m0-m1-contract.md README.md docs/plans/2026-03-17-product-scope-reset-design.md apps/gateway/test/contract-smoke.test.ts
git commit -m "docs: promote agent run api contract"
```

### Task 4: Ship Explicit Deprecation Signals On `/api/v1/chat/compile`

**Files:**
- Modify: `apps/gateway/src/routes/compile.ts`
- Modify: `apps/gateway/test/compile.test.ts`
- Modify: `apps/gateway/test/compile-client-flags.test.ts`

**Step 1: Write the failing tests**

Add assertions that the legacy route returns explicit deprecation metadata without changing its response body:

1. `Deprecation: true`
2. optional `Sunset` date if one is chosen
3. `Link: </api/v2/agent/runs>; rel="successor-version"`

Representative assertion target:

```ts
expect(res.headers.deprecation).toBe("true");
expect(res.headers.link).toContain("/api/v2/agent/runs");
```

**Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @geohelper/gateway test -- test/compile.test.ts test/compile-client-flags.test.ts
```

Expected: FAIL because the route does not emit deprecation headers yet.

**Step 3: Write minimal implementation**

Implement the headers in `registerCompileRoute(...)`:

1. emit the deprecation headers on every successful and error response path
2. do not change the legacy `batch + agent_steps` body during this task
3. keep existing metrics, alerting, and operator event behavior intact

**Step 4: Run tests to verify they pass**

Run:

```bash
pnpm --filter @geohelper/gateway test -- test/compile.test.ts test/compile-client-flags.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/gateway/src/routes/compile.ts apps/gateway/test/compile.test.ts apps/gateway/test/compile-client-flags.test.ts
git commit -m "feat: add deprecation headers to legacy compile route"
```

### Task 5: Remove The Legacy Route In A Final Gated Cut

**Files:**
- Delete: `apps/gateway/src/routes/compile.ts`
- Delete: `apps/gateway/src/routes/compile-route-agent-adapter.ts`
- Delete: `apps/gateway/src/routes/compile-route-alerts.ts`
- Modify: `apps/gateway/src/server.ts`
- Modify: `scripts/smoke/gateway-runtime.mjs`
- Modify: `tests/gateway-runtime-smoke.test.ts`
- Delete/Modify: legacy route tests under `apps/gateway/test/*compile*.test.ts`, `apps/gateway/test/rate-limit.test.ts`, `apps/gateway/test/revoke.test.ts`, `apps/gateway/test/admin-compile-events.test.ts`, `apps/gateway/test/admin-trace-detail.test.ts`, `apps/gateway/test/metrics.test.ts`
- Modify: `docs/api/m0-m1-contract.md`

**Precondition Gate (required before Step 1):**

1. all Tasks 1-4 are merged
2. smoke, benchmark, and live-model scripts no longer hit `/api/v1/chat/compile`
3. operator confirms no external consumers still require the legacy response shape

**Step 1: Write the failing test**

Add one explicit removal guard:

```ts
expect(serverSource).not.toContain("registerCompileRoute");
expect(apiDocs).not.toContain("POST /api/v1/chat/compile");
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @geohelper/gateway test -- test/compile-route-removal.test.ts
```

Expected: FAIL because the route is still registered.

**Step 3: Write minimal implementation**

Perform the clean cut:

1. stop registering the legacy route in `apps/gateway/src/server.ts`
2. remove route-only helper modules that become dead code
3. delete route-specific tests that no longer make sense
4. keep `/api/v2/agent/runs` as the only compile-generation API

**Step 4: Run full verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm --filter @geohelper/web build
pnpm exec playwright test tests/e2e/agent-run-repair.spec.ts tests/e2e/studio-review-flow.spec.ts tests/e2e/studio-canvas-link.spec.ts tests/e2e/studio-result-panel.spec.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: remove legacy compile route"
```

## Notes

1. This migration should be executed in two distinct phases:
   - `Phase A`: internal caller migration + deprecation headers
   - `Phase B`: actual route deletion
2. `Phase B` must not start until an operator explicitly signs off on external caller impact.
3. During `Phase A`, the legacy route should be considered frozen: bug fixes only, no new capability work.

Plan complete and saved to `docs/plans/2026-03-19-legacy-compile-route-migration-plan.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
