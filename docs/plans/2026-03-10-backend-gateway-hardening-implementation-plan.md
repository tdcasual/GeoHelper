# Backend Gateway Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stabilize GeoHelper's Fastify gateway from a beta-grade single-instance helper into a production-tolerant AI gateway for `Official` mode, while preserving the current static-first frontend and optional `Direct BYOK` flow.

**Architecture:** Keep `apps/web` statically deployable and keep `apps/gateway` small: auth, compile orchestration, policy enforcement, and operational visibility. Implement this in three phases: `P0` contract alignment and config hardening, `P1` externalized state for revocation and rate limit, and `P2` observability plus upstream routing improvements. Do **not** add user accounts, cloud chat sync, or general-purpose backend business logic in this plan.

**Tech Stack:** Fastify 5, TypeScript, Vitest, shared `@geohelper/protocol`, LiteLLM/OpenAI-compatible chat APIs, optional Redis-compatible KV for gateway state.

---

## Phase Map

- `P0`: Make gateway behavior match frontend capability declarations and deployment docs.
- `P1`: Remove single-process assumptions for session revoke and rate limiting.
- `P2`: Improve traceability, compile event visibility, and upstream fallback routing.
- Out of scope for this plan: user system, billing, cloud conversation sync, multi-tenant admin UI.

---

### Task 1: Reject unsupported gateway attachments explicitly

**Files:**
- Modify: `apps/gateway/src/routes/compile.ts`
- Modify: `apps/gateway/test/compile.test.ts`
- Modify: `apps/gateway/test/contract-smoke.test.ts`
- Inspect: `apps/web/src/runtime/gateway-client.ts`
- Inspect: `apps/web/src/runtime/types.ts`

**Step 1: Write the failing test**
- Add a gateway compile test that posts an `attachments` array to `/api/v1/chat/compile` and expects a `400` response.
- Assert payload shape is deterministic:

```ts
expect(body).toEqual({
  error: {
    code: "ATTACHMENTS_UNSUPPORTED",
    message: "Gateway runtime does not support attachments yet"
  }
});
```

- Add a contract smoke assertion that a normal compile request without attachments is still accepted.

**Step 2: Run test to verify it fails**
- Run: `pnpm --filter @geohelper/gateway test -- test/compile.test.ts test/contract-smoke.test.ts`
- Expected: FAIL because `CompileBodySchema` currently ignores `attachments` and the route does not reject them.

**Step 3: Write the minimal implementation**
- Extend the compile body schema to accept an optional `attachments` array with a narrow shape matching current frontend transport.
- Before upstream compile execution, reject any non-empty attachment list with:

```ts
return reply.status(400).send({
  error: {
    code: "ATTACHMENTS_UNSUPPORTED",
    message: "Gateway runtime does not support attachments yet"
  }
});
```

- Do not silently drop attachments. Make the contract explicit.

**Step 4: Run tests to verify they pass**
- Run: `pnpm --filter @geohelper/gateway test -- test/compile.test.ts test/contract-smoke.test.ts`
- Expected: PASS.

**Step 5: Commit**
```bash
git add apps/gateway/src/routes/compile.ts apps/gateway/test/compile.test.ts apps/gateway/test/contract-smoke.test.ts
git commit -m "fix: reject unsupported gateway attachments"
```

---

### Task 2: Fail fast on production misconfiguration and align release docs

**Files:**
- Modify: `apps/gateway/src/config.ts`
- Modify: `apps/gateway/test/config-secret.test.ts`
- Modify: `README.md`
- Modify: `docs/BETA_CHECKLIST.md`
- Modify: `docs/deploy/edgeone.md`
- Modify: `.env.release.example`

**Step 1: Write the failing tests**
- Add a config test for `NODE_ENV=production` that expects startup failure when `APP_SECRET` is missing.
- Add a config test for `NODE_ENV=production` that expects startup failure when `LITELLM_ENDPOINT` is missing.
- Add a config test that local development still gets safe defaults when `NODE_ENV` is unset or `development`.

**Step 2: Run tests to verify they fail**
- Run: `pnpm --filter @geohelper/gateway test -- test/config-secret.test.ts`
- Expected: FAIL because `loadConfig()` currently falls back to dev defaults even in production.

**Step 3: Write the minimal implementation**
- Keep local-dev defaults for developer ergonomics.
- In production mode, validate required env vars and throw startup errors such as:

```ts
if (env.NODE_ENV === "production" && !env.APP_SECRET?.trim()) {
  throw new Error("APP_SECRET_REQUIRED");
}
```

- Make `PRESET_TOKEN` required only when `Official` mode is enabled by environment or deployment profile documentation.
- Choose one source of truth for documented defaults and update all docs to match actual code.
- Update `.env.release.example` so operators can deploy without guessing hidden defaults.

**Step 4: Run tests and docs sanity checks**
- Run: `pnpm --filter @geohelper/gateway test -- test/config-secret.test.ts`
- Run: `rg -n "SESSION_TTL_SECONDS|RATE_LIMIT_MAX|LITELLM_ENDPOINT|APP_SECRET" README.md docs/BETA_CHECKLIST.md docs/deploy/edgeone.md .env.release.example`
- Expected: tests PASS, docs show consistent required values and defaults.

**Step 5: Commit**
```bash
git add apps/gateway/src/config.ts apps/gateway/test/config-secret.test.ts README.md docs/BETA_CHECKLIST.md docs/deploy/edgeone.md .env.release.example
git commit -m "chore: harden gateway production config"
```

---

### Task 3: Extract gateway state behind injectable interfaces

**Files:**
- Create: `apps/gateway/src/services/session-store.ts`
- Create: `apps/gateway/src/services/rate-limit-store.ts`
- Create: `apps/gateway/src/services/metrics-store.ts`
- Modify: `apps/gateway/src/services/session.ts`
- Modify: `apps/gateway/src/services/rate-limit.ts`
- Modify: `apps/gateway/src/services/metrics.ts`
- Modify: `apps/gateway/src/server.ts`
- Modify: `apps/gateway/test/revoke.test.ts`
- Modify: `apps/gateway/test/rate-limit.test.ts`
- Modify: `apps/gateway/test/metrics.test.ts`

**Step 1: Write the failing tests**
- Add tests that build the server with injected fake stores instead of relying on module-level singleton state.
- Assert that revoke, rate-limit, and metrics behavior still works through the injected dependency boundary.

**Step 2: Run tests to verify they fail**
- Run: `pnpm --filter @geohelper/gateway test -- test/revoke.test.ts test/rate-limit.test.ts test/metrics.test.ts`
- Expected: FAIL because the current services store state in module globals.

**Step 3: Write the minimal implementation**
- Introduce small interfaces, for example:

```ts
export interface SessionRevocationStore {
  add(tokenHash: string): Promise<void> | void;
  has(tokenHash: string): Promise<boolean> | boolean;
  clear(): Promise<void> | void;
}
```

- Keep memory-backed default adapters in the same files for now.
- Pass stores through `buildServer()` dependencies instead of hardcoding global `Map` and `Set` state.
- Preserve existing API behavior while changing internals only.

**Step 4: Run tests to verify they pass**
- Run: `pnpm --filter @geohelper/gateway test -- test/revoke.test.ts test/rate-limit.test.ts test/metrics.test.ts`
- Expected: PASS.

**Step 5: Commit**
```bash
git add apps/gateway/src/services/session-store.ts apps/gateway/src/services/rate-limit-store.ts apps/gateway/src/services/metrics-store.ts apps/gateway/src/services/session.ts apps/gateway/src/services/rate-limit.ts apps/gateway/src/services/metrics.ts apps/gateway/src/server.ts apps/gateway/test/revoke.test.ts apps/gateway/test/rate-limit.test.ts apps/gateway/test/metrics.test.ts
git commit -m "refactor: inject gateway state stores"
```

---

### Task 4: Add Redis-backed session revocation storage

**Files:**
- Create: `apps/gateway/src/services/kv-client.ts`
- Create: `apps/gateway/src/services/redis-session-store.ts`
- Modify: `apps/gateway/src/config.ts`
- Modify: `apps/gateway/src/server.ts`
- Modify: `apps/gateway/test/revoke.test.ts`
- Modify: `.env.release.example`
- Modify: `docs/BETA_CHECKLIST.md`

**Step 1: Write the failing tests**
- Add tests that verify revocation survives re-creating the server when using a shared store adapter.
- Use a fake KV implementation in tests; do not require a real Redis instance in unit tests.

**Step 2: Run tests to verify they fail**
- Run: `pnpm --filter @geohelper/gateway test -- test/revoke.test.ts`
- Expected: FAIL because revoke state is currently tied to process memory.

**Step 3: Write the minimal implementation**
- Add optional config like `REDIS_URL`.
- Build a tiny KV abstraction in `kv-client.ts` so the rest of the code does not depend on a concrete Redis library.
- Store revoked session hashes with TTL derived from remaining token lifetime.
- Fall back to memory store only when `REDIS_URL` is not configured.

**Step 4: Run tests to verify they pass**
- Run: `pnpm --filter @geohelper/gateway test -- test/revoke.test.ts test/config-secret.test.ts`
- Expected: PASS.

**Step 5: Commit**
```bash
git add apps/gateway/src/services/kv-client.ts apps/gateway/src/services/redis-session-store.ts apps/gateway/src/config.ts apps/gateway/src/server.ts apps/gateway/test/revoke.test.ts .env.release.example docs/BETA_CHECKLIST.md
git commit -m "feat: persist gateway session revocation"
```

---

### Task 5: Add Redis-backed distributed rate limiting

**Files:**
- Create: `apps/gateway/src/services/redis-rate-limit-store.ts`
- Modify: `apps/gateway/src/services/rate-limit.ts`
- Modify: `apps/gateway/src/server.ts`
- Modify: `apps/gateway/test/rate-limit.test.ts`
- Modify: `README.md`
- Modify: `docs/deploy/edgeone.md`

**Step 1: Write the failing tests**
- Add tests for a shared-store rate limiter across two server instances built with the same fake store.
- Assert that requests from instance A affect instance B.

**Step 2: Run tests to verify they fail**
- Run: `pnpm --filter @geohelper/gateway test -- test/rate-limit.test.ts`
- Expected: FAIL because the current limiter uses a per-process `Map`.

**Step 3: Write the minimal implementation**
- Reuse `kv-client.ts` from Task 4.
- Implement fixed-window semantics first; do not add token-bucket complexity yet.
- Keep response headers exactly the same:

```ts
reply.header("x-ratelimit-limit", String(limit.limit));
reply.header("x-ratelimit-remaining", String(limit.remaining));
reply.header("x-ratelimit-reset", String(Math.floor(limit.resetAt / 1000)));
```

- Keep memory fallback for local development.

**Step 4: Run tests to verify they pass**
- Run: `pnpm --filter @geohelper/gateway test -- test/rate-limit.test.ts test/compile.test.ts`
- Expected: PASS.

**Step 5: Commit**
```bash
git add apps/gateway/src/services/redis-rate-limit-store.ts apps/gateway/src/services/rate-limit.ts apps/gateway/src/server.ts apps/gateway/test/rate-limit.test.ts README.md docs/deploy/edgeone.md
git commit -m "feat: distribute gateway rate limiting"
```

---

### Task 6: Add stable request tracing and compile event logging

**Files:**
- Create: `apps/gateway/src/services/compile-events.ts`
- Modify: `apps/gateway/src/server.ts`
- Modify: `apps/gateway/src/routes/compile.ts`
- Modify: `apps/gateway/src/routes/auth.ts`
- Modify: `apps/gateway/src/routes/admin.ts`
- Modify: `apps/gateway/test/compile-alerting.test.ts`
- Modify: `apps/gateway/test/metrics.test.ts`
- Modify: `apps/gateway/test/contract-smoke.test.ts`

**Step 1: Write the failing tests**
- Add tests that assert compile responses use a deterministic `trace_id` derived from request context, not `Date.now()`.
- Add tests that fallback and repair events are written to a compile-event sink with request id, mode, upstream call count, and final status.

**Step 2: Run tests to verify they fail**
- Run: `pnpm --filter @geohelper/gateway test -- test/compile-alerting.test.ts test/metrics.test.ts test/contract-smoke.test.ts`
- Expected: FAIL because trace ids are currently generated ad hoc and compile events are not persisted as first-class records.

**Step 3: Write the minimal implementation**
- Introduce a `CompileEventSink` interface and default log-backed implementation.
- Use `request.id` as the base for `trace_id`, e.g. `tr_${request.id}`.
- Emit structured events for:
  - compile success
  - compile validation failure
  - compile upstream failure
  - compile fallback
  - compile repair
- Keep webhook alerting, but make it a secondary side effect, not the only event trail.

**Step 4: Run tests to verify they pass**
- Run: `pnpm --filter @geohelper/gateway test -- test/compile-alerting.test.ts test/metrics.test.ts test/contract-smoke.test.ts`
- Expected: PASS.

**Step 5: Commit**
```bash
git add apps/gateway/src/services/compile-events.ts apps/gateway/src/server.ts apps/gateway/src/routes/compile.ts apps/gateway/src/routes/auth.ts apps/gateway/src/routes/admin.ts apps/gateway/test/compile-alerting.test.ts apps/gateway/test/metrics.test.ts apps/gateway/test/contract-smoke.test.ts
git commit -m "feat: add gateway compile tracing"
```

---

### Task 7: Add upstream routing and provider fallback policy

**Files:**
- Create: `apps/gateway/src/services/model-router.ts`
- Modify: `apps/gateway/src/services/litellm-client.ts`
- Modify: `apps/gateway/src/config.ts`
- Modify: `apps/gateway/test/compile-client-flags.test.ts`
- Create: `apps/gateway/test/model-router.test.ts`
- Modify: `README.md`
- Modify: `.env.release.example`

**Step 1: Write the failing tests**
- Add a test that simulates primary upstream failure and asserts fallback endpoint/model are used on retry.
- Add a test that keeps current behavior when only legacy single-endpoint env vars are configured.

**Step 2: Run tests to verify they fail**
- Run: `pnpm --filter @geohelper/gateway test -- test/compile-client-flags.test.ts test/model-router.test.ts`
- Expected: FAIL because the current LiteLLM client only knows about one endpoint and one key.

**Step 3: Write the minimal implementation**
- Add a tiny router that resolves:
  - primary endpoint/key/model from existing `LITELLM_ENDPOINT`, `LITELLM_API_KEY`, `LITELLM_MODEL`
  - optional fallback endpoint/key/model from new env vars
- Keep backward compatibility with the current single-endpoint configuration.
- Retry only for transient upstream failures; do not retry schema validation failures.

**Step 4: Run tests to verify they pass**
- Run: `pnpm --filter @geohelper/gateway test -- test/compile-client-flags.test.ts test/model-router.test.ts test/compile.test.ts`
- Expected: PASS.

**Step 5: Commit**
```bash
git add apps/gateway/src/services/model-router.ts apps/gateway/src/services/litellm-client.ts apps/gateway/src/config.ts apps/gateway/test/compile-client-flags.test.ts apps/gateway/test/model-router.test.ts README.md .env.release.example
git commit -m "feat: add gateway upstream fallback routing"
```

---

### Task 8: Final verification and release-gate updates

**Files:**
- Modify: `docs/BETA_CHECKLIST.md`
- Modify: `docs/deploy/edgeone.md`
- Verify: `apps/gateway/**`
- Verify: `apps/web/src/runtime/**`

**Step 1: Run the full gateway test suite**
- Run: `pnpm --filter @geohelper/gateway test`
- Expected: PASS.

**Step 2: Run the relevant frontend runtime tests**
- Run: `pnpm --filter @geohelper/web test -- --run src/runtime/gateway-client.test.ts src/runtime/direct-client.test.ts`
- Expected: PASS.

**Step 3: Run workspace typecheck**
- Run: `pnpm typecheck`
- Expected: PASS.

**Step 4: Run web build**
- Run: `pnpm --filter @geohelper/web build`
- Expected: PASS.

**Step 5: Run optional live smoke for release candidate**
- Run: `LITELLM_ENDPOINT=<endpoint> LITELLM_API_KEY=<key> PRESET_TOKEN=<preset> pnpm smoke:live-model`
- Expected: PASS against a real gateway deployment.

**Step 6: Update release gates**
- Mark the beta checklist with the new operational assumptions:
  - attachments unsupported on gateway until vision phase lands
  - production requires explicit secrets
  - distributed revoke/rate limit are expected when `REDIS_URL` is configured
  - trace ids are available for operator debugging

**Step 7: Commit**
```bash
git add docs/BETA_CHECKLIST.md docs/deploy/edgeone.md
git commit -m "docs: update gateway release gates"
```

---

## Delivery Notes

- Implement `P0` completely before starting `P1`.
- Do not bundle Redis persistence, trace logging, and upstream routing into one giant commit.
- Keep `Direct BYOK` behavior unchanged unless a failing test proves a necessary compatibility fix.
- If Redis support proves too heavy for this repository, keep the interface boundary from `Task 3` and substitute a managed KV adapter, but do not revert to module-global state.
- Do not start P3/platform work from this plan.
