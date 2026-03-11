# Backend V3 Operability Roadmap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Evolve GeoHelper's self-hosted gateway from a deployable control plane into a more durable, diagnosable, and release-friendly operator runtime without expanding into a full product backend.

**Architecture:** Keep `apps/gateway` thin and operator-first. Continue to treat Redis as the only shared fast-state dependency, but extend it from rate-limit/session support into durable compile-event retention so operator queries survive process restarts. Add read-only admin endpoints for trace drill-down and runtime version identity, strengthen smoke verification to validate trace/version/operator loops, and add bounded compile protection so upstream stalls cannot silently degrade the whole gateway.

**Tech Stack:** Fastify 5, TypeScript, Vitest, Redis-compatible KV, Node-based smoke scripts, Docker packaging, shared `@geohelper/protocol`.

---

## Phase Map

- `P0`: Durable operator visibility (`compile-events` retention, trace drill-down, version identity).
- `P1`: Safer releases and stronger smoke verification (`version` + `trace` aware smoke, richer release gates).
- `P1`: Runtime protection (compile concurrency guard, timeout budget, richer alert payloads).
- `P2`: Optional automation of post-deploy verification and historical artifacts.
- Out of scope: user accounts, billing, multi-tenant admin UI, SQL/OLTP backend, cloud conversation history, attachments/vision support.

---

### Task 1: Persist compile events in Redis with bounded retention

**Files:**
- Create: `apps/gateway/src/services/redis-compile-event-sink.ts`
- Modify: `apps/gateway/src/services/compile-events.ts`
- Modify: `apps/gateway/src/server.ts`
- Create: `apps/gateway/test/redis-compile-events.test.ts`
- Modify: `docs/BETA_CHECKLIST.md`
- Modify: `docs/deploy/edgeone.md`

**Step 1: Write the failing tests**
- Add a service-level test for a Redis-backed compile event sink that writes multiple events and reads them back in reverse chronological order.
- Add a filter case that proves trace-specific reads are stable even when unrelated events exist.
- Keep memory-backed fallback behavior unchanged when `REDIS_URL` is absent.

**Step 2: Run tests to verify they fail**
- Run: `pnpm --filter @geohelper/gateway test -- test/redis-compile-events.test.ts test/admin-compile-events.test.ts`
- Expected: FAIL because Redis-backed retention/query support does not exist yet.

**Step 3: Write the minimal implementation**
- Add a Redis-backed compile event sink using the existing KV boundary.
- Store recent events in a bounded retention structure (for example a capped list or sorted set) with TTL so operator history survives process restarts but does not grow forever.
- Extend the compile event sink boundary so `readRecent()` can accept optional filters such as `traceId`, `mode`, `finalStatus`, and `since`.
- Keep memory fallback for local/dev mode and continue to log every event.

**Step 4: Run tests to verify they pass**
- Run: `pnpm --filter @geohelper/gateway test -- test/redis-compile-events.test.ts test/admin-compile-events.test.ts`
- Expected: PASS.

**Step 5: Commit**
```bash
git add apps/gateway/src/services/redis-compile-event-sink.ts apps/gateway/src/services/compile-events.ts apps/gateway/src/server.ts apps/gateway/test/redis-compile-events.test.ts docs/BETA_CHECKLIST.md docs/deploy/edgeone.md
git commit -m "feat: persist gateway compile events"
```

---

### Task 2: Add trace drill-down for operator debugging

**Files:**
- Modify: `apps/gateway/src/routes/admin.ts`
- Modify: `apps/gateway/src/services/compile-events.ts`
- Modify: `apps/gateway/src/server.ts`
- Create: `apps/gateway/test/admin-trace-detail.test.ts`
- Modify: `docs/api/m0-m1-contract.md`
- Modify: `docs/deploy/edgeone.md`

**Step 1: Write the failing tests**
- Add an admin route test for `GET /admin/traces/:traceId`.
- Assert it reuses the same `x-admin-token` rule as `/admin/metrics` and `/admin/compile-events`.
- Assert it returns a deterministic payload containing `traceId`, `requestId`, `finalStatus`, `mode`, and the ordered compile events recorded for that trace.

**Step 2: Run tests to verify they fail**
- Run: `pnpm --filter @geohelper/gateway test -- test/admin-trace-detail.test.ts test/admin-compile-events.test.ts`
- Expected: FAIL because trace drill-down does not exist yet.

**Step 3: Write the minimal implementation**
- Add a read-only trace drill-down route: `GET /admin/traces/:traceId`.
- Resolve the response entirely from the compile event retention layer; do not introduce new mutable operator state.
- Return `404` when no matching trace exists.
- Keep the payload compact and operator-focused rather than dumping raw request bodies.

**Step 4: Run tests to verify they pass**
- Run: `pnpm --filter @geohelper/gateway test -- test/admin-trace-detail.test.ts test/admin-compile-events.test.ts`
- Expected: PASS.

**Step 5: Commit**
```bash
git add apps/gateway/src/routes/admin.ts apps/gateway/src/services/compile-events.ts apps/gateway/src/server.ts apps/gateway/test/admin-trace-detail.test.ts docs/api/m0-m1-contract.md docs/deploy/edgeone.md
git commit -m "feat: add gateway trace drill-down"
```

---

### Task 3: Expose runtime version/build identity

**Files:**
- Create: `apps/gateway/src/services/build-info.ts`
- Modify: `apps/gateway/src/routes/admin.ts`
- Modify: `apps/gateway/src/server.ts`
- Modify: `apps/gateway/Dockerfile`
- Create: `apps/gateway/test/admin-version.test.ts`
- Modify: `README.md`
- Modify: `docs/deploy/edgeone.md`

**Step 1: Write the failing tests**
- Add a route test for `GET /admin/version`.
- Assert it returns deterministic runtime identity fields such as `git_sha`, `build_time`, `node_env`, and whether Redis-backed shared state is enabled.
- Assert admin token protection matches the rest of the admin surface.

**Step 2: Run tests to verify they fail**
- Run: `pnpm --filter @geohelper/gateway test -- test/admin-version.test.ts test/admin-trace-detail.test.ts`
- Expected: FAIL because runtime version identity is not exposed yet.

**Step 3: Write the minimal implementation**
- Add a small build info service that reads identity from environment variables such as `GEOHELPER_BUILD_SHA`, `GEOHELPER_BUILD_TIME`, and container/runtime env.
- Expose a read-only `GET /admin/version` endpoint.
- Update the Dockerfile so image builds can embed `GEOHELPER_BUILD_SHA` and `GEOHELPER_BUILD_TIME` at build time, while keeping sensible local defaults.

**Step 4: Run tests to verify they pass**
- Run: `pnpm --filter @geohelper/gateway test -- test/admin-version.test.ts test/admin-trace-detail.test.ts`
- Expected: PASS.

**Step 5: Commit**
```bash
git add apps/gateway/src/services/build-info.ts apps/gateway/src/routes/admin.ts apps/gateway/src/server.ts apps/gateway/Dockerfile apps/gateway/test/admin-version.test.ts README.md docs/deploy/edgeone.md
git commit -m "feat: expose gateway runtime version"
```

---

### Task 4: Upgrade gateway smoke to validate version, trace, and operator loops

**Files:**
- Modify: `scripts/smoke/gateway-runtime.mjs`
- Modify: `tests/gateway-runtime-smoke.test.ts`
- Modify: `README.md`
- Modify: `docs/BETA_CHECKLIST.md`
- Modify: `docs/deploy/edgeone.md`

**Step 1: Write the failing tests**
- Extend the smoke dry-run test so the ordered checks include:
  - `/api/v1/health`
  - `/api/v1/ready`
  - `/admin/version` (when admin token is present)
  - official auth login/revoke flow (when `PRESET_TOKEN` is present)
  - one compile request
  - one `/admin/compile-events` query (when admin token is present)
  - one `/admin/metrics` query (when admin token is present)
- Assert the plan output stays deterministic and network-free in dry-run mode.

**Step 2: Run tests to verify they fail**
- Run: `pnpm exec vitest run tests/gateway-runtime-smoke.test.ts`
- Expected: FAIL because the smoke plan does not verify version/operator loops yet.

**Step 3: Write the minimal implementation**
- Upgrade the live smoke script so it can:
  - fetch `/admin/version`
  - execute a compile request
  - capture `trace_id` / `x-trace-id`
  - query `/admin/compile-events` and confirm the trace is visible there
  - query `/admin/metrics` and confirm compile totals moved
- Keep dry-run output machine-readable JSON.
- Keep live mode deterministic and small; do not add benchmark logic into smoke.

**Step 4: Run tests to verify they pass**
- Run: `pnpm exec vitest run tests/gateway-runtime-smoke.test.ts`
- Run: `pnpm smoke:gateway-runtime -- --dry-run`
- Expected: PASS.

**Step 5: Commit**
```bash
git add scripts/smoke/gateway-runtime.mjs tests/gateway-runtime-smoke.test.ts README.md docs/BETA_CHECKLIST.md docs/deploy/edgeone.md
git commit -m "feat: strengthen gateway runtime smoke"
```

---

### Task 5: Add compile concurrency and timeout guards

**Files:**
- Create: `apps/gateway/src/services/compile-guard.ts`
- Modify: `apps/gateway/src/config.ts`
- Modify: `apps/gateway/src/routes/compile.ts`
- Create: `apps/gateway/test/compile-guard.test.ts`
- Modify: `docs/BETA_CHECKLIST.md`
- Modify: `docs/deploy/edgeone.md`

**Step 1: Write the failing tests**
- Add a test where `COMPILE_MAX_IN_FLIGHT=1` and a second overlapping compile request is rejected with a stable operator-facing error such as `GATEWAY_BUSY`.
- Add a test where a hung upstream compile exceeds `COMPILE_TIMEOUT_MS` and returns `504` with a stable `COMPILE_TIMEOUT` error.
- Assert alerts and compile events still capture the failure path with trace ids.

**Step 2: Run tests to verify they fail**
- Run: `pnpm --filter @geohelper/gateway test -- test/compile-guard.test.ts test/compile-alerting.test.ts`
- Expected: FAIL because compile concurrency and timeout guards do not exist yet.

**Step 3: Write the minimal implementation**
- Add a small compile guard service that enforces max in-flight compiles and wraps compile execution in a timeout budget.
- Introduce minimal config knobs such as `COMPILE_MAX_IN_FLIGHT` and `COMPILE_TIMEOUT_MS` with safe defaults.
- Return deterministic operator-facing errors and keep existing rate-limit behavior intact.

**Step 4: Run tests to verify they pass**
- Run: `pnpm --filter @geohelper/gateway test -- test/compile-guard.test.ts test/compile-alerting.test.ts`
- Expected: PASS.

**Step 5: Commit**
```bash
git add apps/gateway/src/services/compile-guard.ts apps/gateway/src/config.ts apps/gateway/src/routes/compile.ts apps/gateway/test/compile-guard.test.ts docs/BETA_CHECKLIST.md docs/deploy/edgeone.md
git commit -m "feat: protect gateway compile runtime"
```

---

### Task 6: Enrich alert payloads with operator identity

**Files:**
- Modify: `apps/gateway/src/services/alerting.ts`
- Modify: `apps/gateway/src/routes/compile.ts`
- Modify: `apps/gateway/src/routes/admin.ts`
- Modify: `apps/gateway/test/compile-alerting.test.ts`
- Modify: `README.md`
- Modify: `docs/deploy/edgeone.md`

**Step 1: Write the failing tests**
- Extend alerting tests so fallback/repair/timeout/operator-failure webhooks must include:
  - `traceId`
  - `finalStatus`
  - `event`
  - `git_sha` or runtime version identifier when available
  - active upstream endpoint/model metadata when relevant
- Assert the payload shape is deterministic and compact.

**Step 2: Run tests to verify they fail**
- Run: `pnpm --filter @geohelper/gateway test -- test/compile-alerting.test.ts test/admin-version.test.ts`
- Expected: FAIL because alert payloads do not include runtime identity yet.

**Step 3: Write the minimal implementation**
- Enrich webhook payloads with trace/version/upstream context.
- Keep secrets redacted; do not emit API keys or bearer tokens.
- Ensure the same trace id can be used to correlate alert payloads with `/admin/compile-events` and `/admin/traces/:traceId`.

**Step 4: Run tests to verify they pass**
- Run: `pnpm --filter @geohelper/gateway test -- test/compile-alerting.test.ts test/admin-version.test.ts`
- Expected: PASS.

**Step 5: Commit**
```bash
git add apps/gateway/src/services/alerting.ts apps/gateway/src/routes/compile.ts apps/gateway/src/routes/admin.ts apps/gateway/test/compile-alerting.test.ts README.md docs/deploy/edgeone.md
git commit -m "feat: enrich gateway operator alerts"
```

---

### Task 7: Final verification and V3 release gate refresh

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

**Step 5: Run gateway smoke dry-run and container build**
- Run: `pnpm smoke:gateway-runtime -- --dry-run`
- Run: `pnpm docker:gateway:build`
- Expected: PASS.

**Step 6: Refresh release gates**
- Update docs so operators know:
  - compile events are durable when Redis is enabled
  - `traceId` is the main debugging join key across alerts, events, and smoke
  - `/admin/version` is the release identity source of truth
  - `/api/v1/ready` remains the deploy gate while `/api/v1/health` stays shallow
  - compile concurrency and timeout guards are part of production hardening

**Step 7: Commit**
```bash
git add docs/BETA_CHECKLIST.md docs/deploy/edgeone.md
git commit -m "docs: refresh backend v3 release gates"
```

---

## Deferred Follow-Ups (Do Not Start In This Plan)

- Scheduled smoke/benchmark automation infrastructure.
- Single-tenant template/scene backup API.
- Object storage backed export artifacts.
- Attachments/vision support.
- User accounts, billing, and multi-tenant admin UI.

## Delivery Notes

- Treat this roadmap as `Gateway V3 Operability`, not a general backend expansion.
- Prefer read-only operator surfaces before any new mutable admin workflows.
- Do not add SQL or extra durable backend services unless Redis retention proves insufficient.
- If a task improves complexity more than debuggability/release confidence, cut it.
