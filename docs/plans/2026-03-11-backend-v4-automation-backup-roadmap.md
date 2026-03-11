# Backend V4 Automation & Backup Roadmap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add operator automation and single-tenant backup flows on top of Gateway V3 so a self-hosted GeoHelper deployment can self-check, retain verification evidence, and recover user teaching data without becoming a general-purpose backend.

**Architecture:** Keep `apps/gateway` operator-first and single-tenant. Reuse the existing smoke, benchmark, trace, version, and alerting surfaces rather than inventing a separate control plane. Add one Node-based ops runner that composes smoke + benchmark checks into persistent JSON artifacts, then add a minimal Redis-backed backup slot in gateway for validated app backups exported from the web client. Avoid SQL, user accounts, and multi-tenant admin workflows.

**Tech Stack:** Fastify 5, TypeScript, Vitest, Redis-compatible KV, Node CLI scripts, existing web backup envelope utilities, Docker packaging.

---

## Phase Map

- `P0`: Automated operator checks with local JSON artifacts and deterministic dry-run planning.
- `P1`: Thresholded release policies and alert enrichment for recurring post-deploy verification.
- `P1`: Single-tenant backup export/import APIs backed by Redis retention.
- `P2`: Web-side integration for remote backup push/pull and restore verification.
- Out of scope: user accounts, multi-tenant backup catalogs, SQL/OLTP storage, attachments/vision processing, generic file browser UIs.

---

### Task 1: Add a gateway ops verification runner

**Files:**
- Create: `scripts/ops/run-gateway-ops-checks.mjs`
- Create: `tests/workspace/gateway-ops-runner.test.ts`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/deploy/edgeone.md`

**Step 1: Write the failing test**
- Add a workspace test that proves a new `ops:gateway:verify` package script exists.
- Assert `node scripts/ops/run-gateway-ops-checks.mjs --dry-run` prints deterministic JSON containing ordered steps for gateway smoke and quality benchmark execution.
- Assert dry-run stays network-free and does not create artifact files.

**Step 2: Run the test to verify it fails**
- Run: `pnpm exec vitest run tests/workspace/gateway-ops-runner.test.ts`
- Expected: FAIL because the ops runner script and package command do not exist yet.

**Step 3: Write the minimal implementation**
- Add a small Node runner that plans two checks:
  - `pnpm smoke:gateway-runtime`
  - `pnpm bench:quality`
- Support `--dry-run` and emit machine-readable JSON.
- Add `ops:gateway:verify` to the root `package.json`.
- Document the new runner in `README.md` and `docs/deploy/edgeone.md`.

**Step 4: Run the test to verify it passes**
- Run: `pnpm exec vitest run tests/workspace/gateway-ops-runner.test.ts`
- Run: `pnpm ops:gateway:verify -- --dry-run`
- Expected: PASS.

**Step 5: Commit**
```bash
git add scripts/ops/run-gateway-ops-checks.mjs tests/workspace/gateway-ops-runner.test.ts package.json README.md docs/deploy/edgeone.md
git commit -m "feat: add gateway ops verification runner"
```

---

### Task 2: Persist ops artifacts with manifest + retention layout

**Files:**
- Modify: `scripts/ops/run-gateway-ops-checks.mjs`
- Create: `scripts/ops/lib/artifact-paths.mjs`
- Modify: `tests/workspace/gateway-ops-runner.test.ts`
- Modify: `.gitignore`
- Modify: `README.md`
- Modify: `docs/BETA_CHECKLIST.md`

**Step 1: Write the failing test**
- Extend the ops runner test to assert live mode can write a deterministic artifact directory under `output/ops/<timestamp>/`.
- Assert the runner writes at least:
  - `manifest.json`
  - `smoke.json`
  - `benchmark.json`
  - `summary.json`
- Assert the manifest records status, started/finished timestamps, and relative artifact paths.

**Step 2: Run the test to verify it fails**
- Run: `pnpm exec vitest run tests/workspace/gateway-ops-runner.test.ts`
- Expected: FAIL because no artifact writer or manifest exists yet.

**Step 3: Write the minimal implementation**
- Add a shared helper to resolve artifact directories and write JSON.
- Extend the runner so live mode stores smoke/benchmark outputs plus a summary manifest.
- Keep `output/` ignored and never write artifacts in `--dry-run` mode.

**Step 4: Run the test to verify it passes**
- Run: `pnpm exec vitest run tests/workspace/gateway-ops-runner.test.ts`
- Expected: PASS.

**Step 5: Commit**
```bash
git add scripts/ops/run-gateway-ops-checks.mjs scripts/ops/lib/artifact-paths.mjs tests/workspace/gateway-ops-runner.test.ts .gitignore README.md docs/BETA_CHECKLIST.md
git commit -m "feat: persist gateway ops artifacts"
```

---

### Task 3: Add threshold policy evaluation and recurring alert hooks

**Files:**
- Modify: `scripts/ops/run-gateway-ops-checks.mjs`
- Create: `scripts/ops/lib/evaluate-thresholds.mjs`
- Modify: `tests/workspace/gateway-ops-runner.test.ts`
- Modify: `docs/BETA_CHECKLIST.md`
- Modify: `docs/deploy/edgeone.md`

**Step 1: Write the failing test**
- Add a focused test that feeds synthetic smoke/benchmark outputs into the runner and expects a failing summary when thresholds are violated.
- Cover at least:
  - smoke failure
  - benchmark success rate below threshold
  - benchmark p95 latency over threshold
- Assert the summary stays compact and deterministic.

**Step 2: Run the test to verify it fails**
- Run: `pnpm exec vitest run tests/workspace/gateway-ops-runner.test.ts`
- Expected: FAIL because no threshold evaluator exists yet.

**Step 3: Write the minimal implementation**
- Add threshold flags/env support such as:
  - `OPS_BENCH_MIN_SUCCESS_RATE`
  - `OPS_BENCH_MAX_P95_MS`
- Evaluate smoke + benchmark outputs into one summary status.
- Keep thresholds optional with safe defaults so local dry-run remains easy.

**Step 4: Run the test to verify it passes**
- Run: `pnpm exec vitest run tests/workspace/gateway-ops-runner.test.ts`
- Expected: PASS.

**Step 5: Commit**
```bash
git add scripts/ops/run-gateway-ops-checks.mjs scripts/ops/lib/evaluate-thresholds.mjs tests/workspace/gateway-ops-runner.test.ts docs/BETA_CHECKLIST.md docs/deploy/edgeone.md
git commit -m "feat: evaluate gateway ops thresholds"
```

---

### Task 4: Define a single-tenant remote backup contract and Redis-backed store

**Files:**
- Create: `apps/gateway/src/services/backup-store.ts`
- Create: `apps/gateway/src/services/redis-backup-store.ts`
- Modify: `apps/gateway/src/server.ts`
- Create: `apps/gateway/test/redis-backup-store.test.ts`
- Modify: `docs/api/m0-m1-contract.md`
- Modify: `docs/deploy/edgeone.md`

**Step 1: Write the failing tests**
- Add a service-level test for a Redis-backed backup store that writes one validated backup envelope and reads it back with metadata.
- Add a retention test that proves only the latest single-tenant snapshot is active while the previous snapshot can still be audited if the design keeps a bounded history.
- Keep in-memory fallback behavior for local/dev mode when `REDIS_URL` is absent.

**Step 2: Run the tests to verify they fail**
- Run: `pnpm --filter @geohelper/gateway test -- test/redis-backup-store.test.ts`
- Expected: FAIL because backup storage does not exist yet.

**Step 3: Write the minimal implementation**
- Define a minimal validated backup envelope boundary for the existing web export format.
- Add a single-tenant backup store with Redis-backed persistence plus optional bounded history metadata.
- Wire the store into `buildServer()` with in-memory fallback when Redis is unavailable.

**Step 4: Run the tests to verify they pass**
- Run: `pnpm --filter @geohelper/gateway test -- test/redis-backup-store.test.ts`
- Expected: PASS.

**Step 5: Commit**
```bash
git add apps/gateway/src/services/backup-store.ts apps/gateway/src/services/redis-backup-store.ts apps/gateway/src/server.ts apps/gateway/test/redis-backup-store.test.ts docs/api/m0-m1-contract.md docs/deploy/edgeone.md
git commit -m "feat: add gateway backup store"
```

---

### Task 5: Add admin backup export/import routes

**Files:**
- Modify: `apps/gateway/src/routes/admin.ts`
- Modify: `apps/gateway/src/server.ts`
- Modify: `apps/gateway/src/services/build-info.ts`
- Create: `apps/gateway/test/admin-backups.test.ts`
- Modify: `docs/BETA_CHECKLIST.md`
- Modify: `docs/deploy/edgeone.md`

**Step 1: Write the failing tests**
- Add admin route tests for:
  - `PUT /admin/backups/latest`
  - `GET /admin/backups/latest`
- Assert they reuse the same `x-admin-token` protection as the rest of the admin surface.
- Assert the gateway returns compact metadata including stored timestamp, schema version, and build identity.

**Step 2: Run the tests to verify they fail**
- Run: `pnpm --filter @geohelper/gateway test -- test/admin-backups.test.ts`
- Expected: FAIL because backup admin routes do not exist yet.

**Step 3: Write the minimal implementation**
- Add read/write admin routes for the single latest backup.
- Validate payload shape strictly and reject malformed snapshots.
- Return compact metadata and avoid logging large raw backup bodies.

**Step 4: Run the tests to verify they pass**
- Run: `pnpm --filter @geohelper/gateway test -- test/admin-backups.test.ts`
- Expected: PASS.

**Step 5: Commit**
```bash
git add apps/gateway/src/routes/admin.ts apps/gateway/src/server.ts apps/gateway/src/services/build-info.ts apps/gateway/test/admin-backups.test.ts docs/BETA_CHECKLIST.md docs/deploy/edgeone.md
git commit -m "feat: add gateway backup admin routes"
```

---

### Task 6: Integrate remote backup push/pull in the web runtime

**Files:**
- Modify: `apps/web/src/runtime/gateway-client.ts`
- Modify: `apps/web/src/runtime/gateway-client.test.ts`
- Modify: `apps/web/src/storage/backup.ts`
- Modify: `apps/web/src/storage/backup.test.ts`
- Modify: `apps/web/src/runtime/types.ts`
- Modify: `README.md`

**Step 1: Write the failing tests**
- Add runtime client tests proving the web app can upload the current backup envelope to gateway and fetch the latest remote snapshot back.
- Add storage tests proving a fetched remote backup can be restored via existing import helpers without regressing local merge behavior.
- Keep the remote path opt-in so BYOK-only deployments still work without gateway backup support.

**Step 2: Run the tests to verify they fail**
- Run: `pnpm --filter @geohelper/web test -- --run src/runtime/gateway-client.test.ts src/storage/backup.test.ts`
- Expected: FAIL because remote backup client methods do not exist yet.

**Step 3: Write the minimal implementation**
- Extend `gateway-client` with backup upload/download helpers.
- Reuse the existing backup envelope serializer/importer instead of inventing a second format.
- Keep remote backup calls explicit and gated by gateway availability.

**Step 4: Run the tests to verify they pass**
- Run: `pnpm --filter @geohelper/web test -- --run src/runtime/gateway-client.test.ts src/storage/backup.test.ts`
- Expected: PASS.

**Step 5: Commit**
```bash
git add apps/web/src/runtime/gateway-client.ts apps/web/src/runtime/gateway-client.test.ts apps/web/src/storage/backup.ts apps/web/src/storage/backup.test.ts apps/web/src/runtime/types.ts README.md
git commit -m "feat: add remote gateway backup sync"
```

---

### Task 7: Final verification and V4 release gate refresh

**Files:**
- Modify: `docs/BETA_CHECKLIST.md`
- Modify: `docs/deploy/edgeone.md`
- Verify: `apps/gateway/**`
- Verify: `apps/web/**`
- Verify: `tests/**`

**Step 1: Run the full gateway suite**
- Run: `pnpm --filter @geohelper/gateway test`
- Expected: PASS.

**Step 2: Run focused web backup/runtime tests**
- Run: `pnpm --filter @geohelper/web test -- --run src/runtime/gateway-client.test.ts src/storage/backup.test.ts src/runtime/direct-client.test.ts`
- Expected: PASS.

**Step 3: Run workspace docs + script tests**
- Run: `pnpm exec vitest run tests/workspace/gateway-ops-runner.test.ts tests/workspace/benchmark-runner.test.ts tests/workspace/deploy-docs.test.ts tests/workspace/beta-checklist.test.ts`
- Expected: PASS.

**Step 4: Run workspace typecheck + build**
- Run: `pnpm typecheck`
- Run: `pnpm --filter @geohelper/web build`
- Expected: PASS.

**Step 5: Run runner dry-run + gateway smoke dry-run**
- Run: `pnpm ops:gateway:verify -- --dry-run`
- Run: `pnpm smoke:gateway-runtime -- --dry-run`
- Expected: PASS.

**Step 6: Refresh release gates**
- Update docs so operators know:
  - `ops:gateway:verify` is the recurring post-deploy check entrypoint
  - JSON artifacts live under `output/ops/`
  - threshold failures are release blockers
  - single-tenant backup snapshots can be exported/imported through gateway
  - `traceId` remains the main debugging join key across smoke, alerts, and admin routes

**Step 7: Commit**
```bash
git add docs/BETA_CHECKLIST.md docs/deploy/edgeone.md
git commit -m "docs: refresh backend v4 release gates"
```

---

## Deferred Follow-Ups (Do Not Start In This Plan)

- Object storage backed artifact publish/sync.
- Automatic cron/scheduler hosting outside the repository.
- Multi-tenant backup catalogs or per-user backup authorization.
- Attachments/vision runtime support.
- User accounts, billing, and cloud sync.

## Delivery Notes

- Treat this roadmap as `Gateway V4 Automation & Backup`, not a product-backend expansion.
- Prefer CLI/script + admin route composition before adding new UI surfaces.
- Reuse the existing backup envelope and operator routes wherever possible.
- If a task drifts toward generalized storage abstraction without clear operator value, cut it.
