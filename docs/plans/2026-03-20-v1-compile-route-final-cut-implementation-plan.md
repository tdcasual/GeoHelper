# V1 Compile Route Final Cut Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove `POST /api/v1/chat/compile` safely after external observation sign-off, while preserving all release-critical runtime guarantees on the `POST /api/v2/agent/runs` path.

**Architecture:** Treat this as a two-phase cut. Phase 1 is operational sign-off: prove no external consumer still depends on the legacy `batch + agent_steps` shell. Phase 2 is the code cut: move any still-required runtime behavior that only exists on the legacy route to the v2 path, then delete the route, its adapter-only helpers, its route-specific tests, and its user-facing docs.

**Tech Stack:** Fastify, TypeScript, Vitest, Playwright, Node ops scripts, release docs

---

## Preconditions

Do not start the code cut until all of these are true:

1. The external observation checklist in `docs/deploy/legacy-compile-external-consumer-checklist.md` is signed off.
2. The full 7 consecutive day window has completed on the real shared gateway.
3. `/admin/compile-events`, access logs, and CDN / proxy logs show no unexplained `/api/v1/chat/compile` traffic.
4. Known external consumers have either migrated or explicitly confirmed they no longer use the route.
5. Fresh migration verification is green:
   - `pnpm smoke:gateway-runtime`
   - `pnpm bench:quality`
   - relevant gateway tests
   - `pnpm typecheck`

If any precondition is false, stop here and do not delete v1.

### Task 1: Record External Sign-off And Freeze The Removal Window

**Files:**
- Verify: `docs/deploy/legacy-compile-external-consumer-checklist.md`
- Modify: `docs/BETA_CHECKLIST.md`
- Modify: `docs/plans/2026-03-19-legacy-compile-route-migration-plan.md`
- Create: `docs/deploy/legacy-compile-removal-signoff-2026-03-XX.md`

**Step 1: Record the real operator sign-off**

Create `docs/deploy/legacy-compile-removal-signoff-2026-03-XX.md` with:

```text
Legacy compile external consumer check
Date:
Timezone:
Operator:
Window:
Legacy hits observed:
Known external consumers:
Decision: GO
Evidence:
- /admin/compile-events artifact
- access log / CDN log artifact
- operator confirmation table
Notes:
```

**Step 2: Update the release checklist from “pending observation” to “observation complete”**

In `docs/BETA_CHECKLIST.md`, replace the current “external observation still pending” wording with:

1. exact sign-off date
2. evidence file path
3. owner / approver name
4. statement that v1 deletion is now unblocked

**Step 3: Update the migration plan status**

In `docs/plans/2026-03-19-legacy-compile-route-migration-plan.md`:

1. mark “Operator confirms no external consumers…” as complete
2. keep “Legacy route and its adapter/tests are removed…” as the only remaining unchecked item

**Step 4: Verify docs still pass**

Run:

```bash
pnpm test -- tests/workspace/beta-checklist.test.ts tests/workspace/deploy-docs.test.ts tests/workspace/legacy-compile-cutover-docs.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add docs/BETA_CHECKLIST.md docs/plans/2026-03-19-legacy-compile-route-migration-plan.md docs/deploy/legacy-compile-removal-signoff-2026-03-XX.md
git commit -m "docs: record legacy compile removal signoff"
```

### Task 2: Port Remaining Release-Critical Runtime Signals To V2

**Why this task exists:**

`/api/v2/agent/runs` is the primary runtime path, but the current alert drill and several route-level tests still depend on the legacy route behavior. Do not delete v1 until the still-required operational signals survive on v2.

**Files:**
- Modify: `apps/gateway/src/routes/agent-runs.ts`
- Reuse: `apps/gateway/src/routes/compile-route-alerts.ts`
- Reuse: `apps/gateway/src/routes/compile-route-agent-adapter.ts` only if any helper logic is still needed during migration
- Modify: `apps/gateway/test/agent-run-events.test.ts`
- Create: `apps/gateway/test/agent-run-alerting.test.ts`
- Modify: `apps/gateway/test/agent-run-metrics.test.ts`

**Step 1: Write the failing v2 alerting test**

Create `apps/gateway/test/agent-run-alerting.test.ts` with coverage for:

1. successful v2 run does not send a webhook
2. repair on v2 emits `compile_repair` event and sends the alert webhook
3. timeout / busy / upstream-failure cases on v2 still produce the operator signal you want to preserve

Representative assertion target:

```ts
expect(body).toMatchObject({
  source: "geohelper-gateway",
  event: "compile_repair",
  finalStatus: "repair",
  traceId: "tr_req-1"
});
```

**Step 2: Run the failing tests**

Run:

```bash
pnpm --filter @geohelper/gateway test -- test/agent-run-alerting.test.ts test/agent-run-events.test.ts test/agent-run-metrics.test.ts
```

Expected: FAIL because v2 currently records metrics/events but does not yet mirror the full operator alert behavior.

**Step 3: Implement the smallest v2 alerting bridge**

In `apps/gateway/src/routes/agent-runs.ts`:

1. add the same route-scoped alert helper pattern used by `apps/gateway/src/routes/compile.ts`
2. emit `compile_repair` when a repair pass succeeds
3. preserve `compile_success` / failure / rate-limit metrics behavior
4. keep the v2 response contract unchanged

Do not add legacy `batch + agent_steps` response shape here.

**Step 4: Re-run the v2 alerting tests**

Run:

```bash
pnpm --filter @geohelper/gateway test -- test/agent-run-alerting.test.ts test/agent-run-events.test.ts test/agent-run-metrics.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/gateway/src/routes/agent-runs.ts apps/gateway/test/agent-run-alerting.test.ts apps/gateway/test/agent-run-events.test.ts apps/gateway/test/agent-run-metrics.test.ts
git commit -m "feat: preserve compile alerts on agent run route"
```

### Task 3: Migrate Surviving Route Semantics And Coverage Off V1

**Files:**
- Modify: `apps/gateway/test/rate-limit.test.ts`
- Modify: `apps/gateway/test/revoke.test.ts`
- Modify: `apps/gateway/test/compile-guard.test.ts`
- Modify: `apps/gateway/test/metrics.test.ts`
- Modify: `apps/gateway/test/agent-runs.test.ts`
- Modify: `apps/gateway/test/contract-smoke.test.ts`
- Modify: `apps/web/src/state/settings-runtime-resolver.ts`
- Modify: `apps/web/src/state/chat-store.test.ts`
- Modify: `docs/api/m0-m1-contract.md`

**Step 1: Decide which v1-only flags are being kept vs removed**

Audit these headers:

1. `x-client-strict-validation`
2. `x-client-fallback-single-agent`
3. `x-client-performance-sampling`

Current state:

1. the web runtime still emits them from `apps/web/src/state/settings-runtime-resolver.ts`
2. the v1 route reads them
3. the v2 route does not

Choose one policy and document it in the code change:

1. preserve on v2, or
2. explicitly remove them from the active client/runtime path

Do not silently delete v1 while leaving dead client headers behind.

**Step 2: Write failing tests for the behaviors that must survive**

Port these behaviors to v2-targeting tests:

1. rate limiting
2. official-mode revoke / session enforcement
3. busy / timeout handling
4. compile metrics movement
5. contract-smoke examples that should remain true after v1 removal

Representative route switch:

```ts
url: "/api/v2/agent/runs"
```

**Step 3: Run the targeted failing tests**

Run:

```bash
pnpm --filter @geohelper/gateway test -- test/rate-limit.test.ts test/revoke.test.ts test/compile-guard.test.ts test/metrics.test.ts test/agent-runs.test.ts test/contract-smoke.test.ts
```

Expected: FAIL where tests still point at `/api/v1/chat/compile` or assert legacy-only headers / body.

**Step 4: Implement the minimal migration**

1. switch all still-relevant route tests to `/api/v2/agent/runs`
2. move retained assertions to the v2 envelope shape
3. remove or rewrite assertions that only existed for the legacy shell
4. clean dead web-side header emission if those flags are intentionally retired

**Step 5: Re-run the targeted tests**

Run:

```bash
pnpm --filter @geohelper/gateway test -- test/rate-limit.test.ts test/revoke.test.ts test/compile-guard.test.ts test/metrics.test.ts test/agent-runs.test.ts test/contract-smoke.test.ts
pnpm --filter @geohelper/web test -- src/state/chat-store.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add apps/gateway/test/rate-limit.test.ts apps/gateway/test/revoke.test.ts apps/gateway/test/compile-guard.test.ts apps/gateway/test/metrics.test.ts apps/gateway/test/agent-runs.test.ts apps/gateway/test/contract-smoke.test.ts apps/web/src/state/settings-runtime-resolver.ts apps/web/src/state/chat-store.test.ts docs/api/m0-m1-contract.md
git commit -m "refactor: move surviving compile semantics to agent run path"
```

### Task 4: Remove The Legacy Route Registration And Adapter Code

**Files:**
- Modify: `apps/gateway/src/server.ts`
- Delete: `apps/gateway/src/routes/compile.ts`
- Delete: `apps/gateway/src/routes/compile-route-alerts.ts` if no longer used after Task 2
- Delete: `apps/gateway/src/routes/compile-route-agent-adapter.ts` if no longer used after Task 2
- Modify: `apps/gateway/test/compile-route-removal.test.ts`

**Step 1: Write the failing route-removal test**

Update `apps/gateway/test/compile-route-removal.test.ts` to assert:

1. `server.ts` no longer imports or registers `registerCompileRoute`
2. `POST /api/v1/chat/compile` returns `404`

Representative assertion target:

```ts
expect(res.statusCode).toBe(404);
```

**Step 2: Run the failing removal test**

Run:

```bash
pnpm --filter @geohelper/gateway test -- test/compile-route-removal.test.ts
```

Expected: FAIL because the route is still registered.

**Step 3: Delete the route and registration**

In `apps/gateway/src/server.ts`:

1. remove the import of `registerCompileRoute`
2. remove the call to `registerCompileRoute(app, config, services)`

Then delete the legacy-only route / helper files that are no longer referenced.

**Step 4: Re-run the removal test**

Run:

```bash
pnpm --filter @geohelper/gateway test -- test/compile-route-removal.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/gateway/src/server.ts apps/gateway/test/compile-route-removal.test.ts
git rm apps/gateway/src/routes/compile.ts apps/gateway/src/routes/compile-route-alerts.ts apps/gateway/src/routes/compile-route-agent-adapter.ts
git commit -m "refactor: remove legacy compile route"
```

### Task 5: Delete Legacy Route Test Suites And Operator Cleanup Artifacts

**Files:**
- Delete: `apps/gateway/test/compile.test.ts`
- Delete: `apps/gateway/test/compile-client-flags.test.ts`
- Delete: `apps/gateway/test/compile-alerting.test.ts`
- Delete only if fully superseded: any remaining v1-only assertions in `apps/gateway/test/metrics.test.ts`, `apps/gateway/test/revoke.test.ts`, `apps/gateway/test/rate-limit.test.ts`, `apps/gateway/test/compile-guard.test.ts`
- Delete: `scripts/ops/check-legacy-compile-consumers.mjs`
- Delete: `tests/workspace/legacy-compile-check-runner.test.ts`
- Modify or archive: `docs/deploy/legacy-compile-external-consumer-checklist.md`

**Step 1: Write the failing workspace expectation**

Update or replace the workspace doc test so it no longer expects the legacy check runner or active v1 operator checklist in the mainline release path.

**Step 2: Run the failing workspace tests**

Run:

```bash
pnpm test -- tests/workspace/legacy-compile-check-runner.test.ts tests/workspace/legacy-compile-cutover-docs.test.ts
```

Expected: FAIL because those tests still expect the legacy cutover tooling to remain active.

**Step 3: Remove or archive the old cleanup artifacts**

Choose one of these explicit outcomes:

1. delete the checklist / runner entirely, or
2. move the checklist to an archive / sign-off location and update tests accordingly

Do not leave `ops:legacy-compile-check` in `package.json` after the route is gone.

**Step 4: Re-run the workspace tests**

Run:

```bash
pnpm test -- tests/workspace/legacy-compile-cutover-docs.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add docs/deploy/legacy-compile-external-consumer-checklist.md tests/workspace/legacy-compile-cutover-docs.test.ts package.json
git rm scripts/ops/check-legacy-compile-consumers.mjs tests/workspace/legacy-compile-check-runner.test.ts apps/gateway/test/compile.test.ts apps/gateway/test/compile-client-flags.test.ts apps/gateway/test/compile-alerting.test.ts
git commit -m "chore: remove legacy compile cleanup artifacts"
```

### Task 6: Rewrite Public Docs To V2-Only And Close The Release Note

**Files:**
- Modify: `README.md`
- Modify: `docs/api/m0-m1-contract.md`
- Modify: `docs/BETA_CHECKLIST.md`
- Modify: `docs/deploy/edgeone.md`
- Modify: `docs/plans/2026-03-19-legacy-compile-route-migration-plan.md`

**Step 1: Write the failing doc assertions**

Update doc tests so active docs no longer require `/api/v1/chat/compile` in primary documentation.

Representative assertion target:

```ts
expect(doc).not.toContain("POST /api/v1/chat/compile");
expect(doc).toContain("POST /api/v2/agent/runs");
```

Historical plan docs under `docs/plans/` may still mention v1 as historical context; primary product / operator docs should not.

**Step 2: Run the failing doc tests**

Run:

```bash
pnpm test -- tests/workspace/beta-checklist.test.ts tests/workspace/deploy-docs.test.ts tests/workspace/legacy-compile-cutover-docs.test.ts
pnpm --filter @geohelper/gateway test -- test/contract-smoke.test.ts
```

Expected: FAIL because active docs still describe the legacy route.

**Step 3: Update docs**

1. remove the active v1 contract section from `docs/api/m0-m1-contract.md`
2. update `README.md` from “legacy shell remains” to “v2 only”
3. update `docs/BETA_CHECKLIST.md` to record that v1 was removed after sign-off
4. update `docs/deploy/edgeone.md` so it references the completed sign-off artifact instead of a pending cutover checklist
5. update the migration plan status to fully complete

**Step 4: Re-run the doc tests**

Run:

```bash
pnpm test -- tests/workspace/beta-checklist.test.ts tests/workspace/deploy-docs.test.ts tests/workspace/legacy-compile-cutover-docs.test.ts
pnpm --filter @geohelper/gateway test -- test/contract-smoke.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add README.md docs/api/m0-m1-contract.md docs/BETA_CHECKLIST.md docs/deploy/edgeone.md docs/plans/2026-03-19-legacy-compile-route-migration-plan.md tests/workspace/beta-checklist.test.ts tests/workspace/deploy-docs.test.ts tests/workspace/legacy-compile-cutover-docs.test.ts apps/gateway/test/contract-smoke.test.ts
git commit -m "docs: remove legacy compile route references"
```

### Task 7: Run The Final Removal Verification Gate

**Files:**
- Verify only

**Step 1: Run targeted gateway verification**

Run:

```bash
pnpm --filter @geohelper/gateway test -- test/agent-runs.test.ts test/agent-run-events.test.ts test/agent-run-metrics.test.ts test/compile-route-removal.test.ts test/rate-limit.test.ts test/revoke.test.ts test/compile-guard.test.ts test/metrics.test.ts test/contract-smoke.test.ts
```

Expected: PASS.

**Step 2: Run workspace / docs verification**

Run:

```bash
pnpm test -- tests/workspace/beta-checklist.test.ts tests/workspace/deploy-docs.test.ts tests/workspace/legacy-compile-cutover-docs.test.ts
```

Expected: PASS.

**Step 3: Run release-facing runtime verification**

Run:

```bash
pnpm typecheck
pnpm smoke:gateway-runtime -- --dry-run
pnpm bench:quality -- --dry-run
pnpm build:web
```

Expected: PASS.

**Step 4: Verify the active tree no longer references the live legacy route**

Run:

```bash
rg -n '/api/v1/chat/compile' apps scripts tests docs README.md package.json
```

Expected:

1. no matches in active gateway / web / scripts / primary docs
2. historical references allowed only in archived sign-off records or older plan history you intentionally keep

**Step 5: Commit**

```bash
git status --short
```

Expected: only the intended final-cut changes remain.

## Final Acceptance

This cut is complete only when all of the following are true:

1. external observation sign-off is recorded
2. v2 preserves the required runtime / alerting behavior
3. `POST /api/v1/chat/compile` returns `404`
4. active docs are v2-only
5. no release command or operator workflow still depends on the legacy route
6. the full final verification gate is green
