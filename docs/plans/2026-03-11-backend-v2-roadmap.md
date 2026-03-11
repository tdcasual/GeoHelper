# Backend V2 Roadmap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Advance GeoHelper's backend from a production-tolerant compile gateway into a stable self-hosted `Gateway control plane` with stronger deployability, operator visibility, and release confidence, while keeping `apps/web` static-first and avoiding heavy backend product scope.

**Architecture:** Keep `apps/gateway` thin and focused: auth, compile orchestration, policy enforcement, readiness checks, operator event/query endpoints, and deployment smoke tooling. Prioritize `operability before new business features`: first make the existing gateway easier to observe, verify, and deploy; only then consider optional single-tenant cloud backup for personal teaching use. Do **not** introduce user accounts, billing, multi-tenant admin UI, or full cloud chat history in this roadmap.

**Tech Stack:** Fastify 5, TypeScript, Vitest, Redis-compatible KV, Node-based smoke scripts, Docker container packaging, shared `@geohelper/protocol`.

---

## Phase Map

- `P0`: Operational hardening for a self-hosted gateway (`ready` endpoint, operator event query, deterministic smoke checks).
- `P1`: Deployment repeatability (container image, staging/deploy workflow, release contract updates).
- `P2`: Optional single-tenant persistence only if it clearly helps personal teaching workflows.
- Out of scope: user system, billing, cloud conversation sync, collaboration backend, multi-tenant admin console.

---

### Task 1: Add readiness endpoint and dependency checks

**Files:**
- Create: `apps/gateway/src/services/runtime-readiness.ts`
- Modify: `apps/gateway/src/routes/health.ts`
- Modify: `apps/gateway/src/server.ts`
- Create: `apps/gateway/test/readiness.test.ts`
- Modify: `docs/api/m0-m1-contract.md`
- Modify: `docs/deploy/edgeone.md`

**Step 1: Write the failing tests**
- Add a readiness test for `GET /api/v1/ready` that expects `200` with `ready: true` in local/default mode.
- Add a readiness test that injects a failing dependency check (for example Redis/KV) and expects `503` with a deterministic payload listing the failed dependency.
- Keep `GET /api/v1/health` unchanged as a shallow liveness endpoint.

**Step 2: Run tests to verify they fail**
- Run: `pnpm --filter @geohelper/gateway test -- test/readiness.test.ts test/health.test.ts`
- Expected: FAIL because `/api/v1/ready` and dependency probing do not exist yet.

**Step 3: Write the minimal implementation**
- Add a small runtime-readiness service that checks only configured dependencies:
  - `LITELLM_ENDPOINT` presence is configuration-level and should already fail fast at startup.
  - `REDIS_URL` should be probed only when configured.
- Expose `GET /api/v1/ready` with a payload like:

```json
{
  "ready": true,
  "dependencies": []
}
```

- If a configured dependency is unavailable, return `503` and include a stable dependency list.

**Step 4: Run tests to verify they pass**
- Run: `pnpm --filter @geohelper/gateway test -- test/readiness.test.ts test/health.test.ts`
- Expected: PASS.

**Step 5: Commit**
```bash
git add apps/gateway/src/services/runtime-readiness.ts apps/gateway/src/routes/health.ts apps/gateway/src/server.ts apps/gateway/test/readiness.test.ts docs/api/m0-m1-contract.md docs/deploy/edgeone.md
git commit -m "feat: add gateway readiness checks"
```

---

### Task 2: Expose compile events through an operator query endpoint

**Files:**
- Modify: `apps/gateway/src/services/compile-events.ts`
- Modify: `apps/gateway/src/routes/admin.ts`
- Modify: `apps/gateway/src/server.ts`
- Create: `apps/gateway/test/admin-compile-events.test.ts`
- Modify: `docs/BETA_CHECKLIST.md`
- Modify: `docs/deploy/edgeone.md`

**Step 1: Write the failing tests**
- Add an admin route test for `GET /admin/compile-events?limit=20`.
- Assert it reuses the existing admin token gate.
- Assert it returns recent compile events in reverse chronological order with `traceId`, `event`, `finalStatus`, `mode`, and `requestId`.

**Step 2: Run tests to verify they fail**
- Run: `pnpm --filter @geohelper/gateway test -- test/admin-compile-events.test.ts test/compile-alerting.test.ts`
- Expected: FAIL because compile events are currently write-only.

**Step 3: Write the minimal implementation**
- Extend the compile event sink boundary so memory-backed and future Redis-backed sinks can expose recent records.
- Add `GET /admin/compile-events` behind the same `x-admin-token` rule as `/admin/metrics`.
- Support a small `limit` query parameter with a safe cap, such as `100`.
- Do not add mutation or delete endpoints.

**Step 4: Run tests to verify they pass**
- Run: `pnpm --filter @geohelper/gateway test -- test/admin-compile-events.test.ts test/compile-alerting.test.ts`
- Expected: PASS.

**Step 5: Commit**
```bash
git add apps/gateway/src/services/compile-events.ts apps/gateway/src/routes/admin.ts apps/gateway/src/server.ts apps/gateway/test/admin-compile-events.test.ts docs/BETA_CHECKLIST.md docs/deploy/edgeone.md
git commit -m "feat: expose gateway compile events"
```

---

### Task 3: Add a repeatable container build for the gateway

**Files:**
- Create: `apps/gateway/Dockerfile`
- Create: `apps/gateway/.dockerignore`
- Modify: `apps/gateway/package.json`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/deploy/edgeone.md`

**Step 1: Write the failing validation step**
- Decide the container contract first:
  - image builds from repo root
  - starts `apps/gateway`
  - exposes `PORT=8787`
  - does not bundle unnecessary web artifacts
- Add a root package script such as `docker:gateway:build` pointing to the future Docker build command.

**Step 2: Run the build command to verify it fails**
- Run: `pnpm docker:gateway:build`
- Expected: FAIL because the Dockerfile and script do not exist yet.

**Step 3: Write the minimal implementation**
- Create a small production Dockerfile for the Fastify gateway only.
- Prefer a multi-stage build that installs workspace dependencies once and starts `apps/gateway` with `pnpm --filter @geohelper/gateway start`.
- Add a focused `.dockerignore` so large static/vendor output and Playwright assets are not copied accidentally.

**Step 4: Run the build to verify it works**
- Run: `pnpm docker:gateway:build`
- Expected: PASS.

**Step 5: Commit**
```bash
git add apps/gateway/Dockerfile apps/gateway/.dockerignore apps/gateway/package.json package.json README.md docs/deploy/edgeone.md
git commit -m "build: add gateway container image"
```

---

### Task 4: Add a deterministic gateway deploy smoke script

**Files:**
- Create: `scripts/smoke/gateway-runtime.mjs`
- Modify: `package.json`
- Create: `tests/gateway-runtime-smoke.test.ts`
- Modify: `README.md`
- Modify: `docs/BETA_CHECKLIST.md`
- Modify: `docs/deploy/edgeone.md`

**Step 1: Write the failing test**
- Add a test for the smoke script argument handling using a `--dry-run` mode.
- Assert it prints the expected ordered checks without making network calls when dry-run is enabled.
- Expected checks should include:
  - `/api/v1/health`
  - `/api/v1/ready`
  - auth login/revoke flow (when `PRESET_TOKEN` provided)
  - one compile request
  - one `/admin/metrics` request (when admin token provided)

**Step 2: Run test to verify it fails**
- Run: `pnpm exec vitest run tests/gateway-runtime-smoke.test.ts`
- Expected: FAIL because the smoke script does not exist yet.

**Step 3: Write the minimal implementation**
- Implement a Node script instead of shell-only logic so it is testable.
- Add a root script such as `smoke:gateway-runtime`.
- Require explicit env vars for live mode (for example `GATEWAY_URL`, optional `PRESET_TOKEN`, optional `ADMIN_METRICS_TOKEN`).
- Keep the live compile request deterministic and small.

**Step 4: Run tests to verify they pass**
- Run: `pnpm exec vitest run tests/gateway-runtime-smoke.test.ts`
- Run: `pnpm smoke:gateway-runtime -- --dry-run`
- Expected: PASS.

**Step 5: Commit**
```bash
git add scripts/smoke/gateway-runtime.mjs package.json tests/gateway-runtime-smoke.test.ts README.md docs/BETA_CHECKLIST.md docs/deploy/edgeone.md
git commit -m "feat: add gateway deploy smoke script"
```

---

### Task 5: Final verification and V2 release gate refresh

**Files:**
- Modify: `docs/BETA_CHECKLIST.md`
- Modify: `docs/deploy/edgeone.md`
- Verify: `apps/gateway/**`
- Verify: `tests/**`

**Step 1: Run the full gateway suite**
- Run: `pnpm --filter @geohelper/gateway test`
- Expected: PASS.

**Step 2: Run the focused web runtime suite**
- Run: `pnpm --filter @geohelper/web test -- --run src/runtime/gateway-client.test.ts src/runtime/direct-client.test.ts`
- Expected: PASS.

**Step 3: Run workspace typecheck**
- Run: `pnpm typecheck`
- Expected: PASS.

**Step 4: Run the web build**
- Run: `pnpm --filter @geohelper/web build`
- Expected: PASS.

**Step 5: Run gateway smoke dry-run and optional live smoke**
- Run: `pnpm smoke:gateway-runtime -- --dry-run`
- Optional live run: `GATEWAY_URL=<url> PRESET_TOKEN=<preset> ADMIN_METRICS_TOKEN=<token> pnpm smoke:gateway-runtime`
- Expected: dry-run PASS; live run PASS when a real deployment is available.

**Step 6: Refresh release gates**
- Update docs so operators know:
  - `health` is liveness only
  - `ready` is deploy gate
  - compile events are queryable via admin route
  - `x-trace-id`/`trace_id` are first-class debugging tools
  - `REDIS_URL` is still the only supported shared fast-state dependency

**Step 7: Commit**
```bash
git add docs/BETA_CHECKLIST.md docs/deploy/edgeone.md
git commit -m "docs: refresh backend v2 release gates"
```

---

## Deferred Follow-Ups (Do Not Start In This Plan)

- Single-tenant template/scene backup API for personal teaching use.
- Object-storage backed export artifacts.
- Scheduled benchmark/smoke automation.
- Vision/attachments support.
- Cloud chat history or account-backed persistence.

## Delivery Notes

- Treat this roadmap as `Gateway V2`, not `GeoHelper full backend`.
- Prefer operator-only capabilities before any end-user cloud features.
- Keep all new admin/query routes read-only unless a failing use case proves mutation is necessary.
- If a task increases complexity without improving deploy confidence or debugging speed, cut it.
