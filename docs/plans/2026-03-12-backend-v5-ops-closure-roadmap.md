# Backend V5 Ops Closure & Remote Recovery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

> Status: Completed and retained in `main` as historical implementation context.

**Goal:** Close the self-hosted operator loop around recurring gateway verification, published evidence, alertable summaries, and explicit remote backup recovery without turning GeoHelper into a general cloud backend.

**Architecture:** Keep the existing Node-based ops runner as the orchestration core, but add a scheduled wrapper that can be called by any external cron platform, publish generated artifacts to S3-compatible object storage, and emit compact webhook summaries with artifact links. Reuse the current single-tenant backup envelope and gateway admin routes, extract the envelope contract into `@geohelper/protocol` so scripts/browser/gateway validate the same shape, then expose explicit remote backup push/pull/restore actions inside the existing settings drawer using an encrypted admin token.

**Tech Stack:** Node CLI scripts, Vitest workspace tests, TypeScript, `@geohelper/protocol`, Fastify admin routes, React + Zustand, browser secret service, S3-compatible object storage via AWS SDK v3.

---

## Phase Map

- `P0`: Shared backup contract for browser + gateway + CLI.
- `P1`: Scheduled ops wrapper with deterministic dry-run output.
- `P1`: S3-compatible artifact publishing and compact webhook summaries.
- `P1`: Gateway latest-backup restore drill for operator recovery checks.
- `P2`: Web settings support for encrypted remote-backup admin token and explicit push/pull actions.
- Out of scope: provider-specific cron/IaC provisioning, multi-tenant backup catalogs, SQL storage, user accounts, attachments/vision runtime.

---

### Task 1: Extract the shared backup envelope contract into `@geohelper/protocol`

**Files:**
- Create: `packages/protocol/src/backup.ts`
- Modify: `packages/protocol/src/index.ts`
- Create: `packages/protocol/test/backup.test.ts`
- Modify: `apps/web/src/storage/backup.ts`
- Modify: `apps/web/src/storage/backup.test.ts`
- Modify: `apps/gateway/src/services/backup-store.ts`
- Modify: `apps/gateway/test/redis-backup-store.test.ts`

**Step 1: Write the failing tests**
- Add protocol tests proving one shared helper can:
  - create a checksum-bearing envelope
  - parse/validate a stored envelope
  - inspect envelope metadata without browser-only dependencies
- Extend the focused web/gateway tests so they expect `apps/web` and `apps/gateway` to import backup envelope utilities from `@geohelper/protocol` rather than duplicating the contract.

**Step 2: Run the tests to verify they fail**
- Run: `pnpm --filter @geohelper/protocol test -- --run test/backup.test.ts`
- Run: `pnpm --filter @geohelper/web test -- --run src/storage/backup.test.ts`
- Run: `pnpm --filter @geohelper/gateway test -- test/redis-backup-store.test.ts`
- Expected: FAIL because shared backup helpers do not exist yet.

**Step 3: Write the minimal implementation**
- Add a protocol module exporting:
  - `BackupEnvelopeSchema`
  - `createBackupEnvelope(payload, options?)`
  - `createBackupBlob(envelope)`
  - `parseBackupEnvelope(value)`
  - `inspectBackupEnvelope(envelope, schemaVersion)`
- Move checksum generation into the shared module.
- Update `apps/web/src/storage/backup.ts` to reuse the shared helpers.
- Update `apps/gateway/src/services/backup-store.ts` to validate via the shared schema instead of maintaining a second envelope contract.

**Step 4: Run the tests to verify they pass**
- Run the same three commands from Step 2.
- Expected: PASS.

**Step 5: Commit**
```bash
git add packages/protocol/src/backup.ts packages/protocol/src/index.ts packages/protocol/test/backup.test.ts apps/web/src/storage/backup.ts apps/web/src/storage/backup.test.ts apps/gateway/src/services/backup-store.ts apps/gateway/test/redis-backup-store.test.ts
git commit -m "refactor: share backup envelope protocol"
```

---

### Task 2: Add a scheduled gateway ops wrapper for external cron platforms

**Files:**
- Create: `scripts/ops/run-scheduled-gateway-verify.mjs`
- Create: `tests/workspace/gateway-ops-scheduled.test.ts`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/deploy/edgeone.md`

**Step 1: Write the failing test**
- Add a workspace test proving a new root script `ops:gateway:scheduled` exists.
- Assert `pnpm ops:gateway:scheduled -- --dry-run` prints deterministic JSON describing:
  - the run label / deployment label
  - the verify phase
  - a publish phase placeholder
  - a notify phase placeholder
- Assert dry-run makes no network calls and does not write files.

**Step 2: Run the test to verify it fails**
- Run: `pnpm exec vitest run tests/workspace/gateway-ops-scheduled.test.ts`
- Expected: FAIL because the scheduled wrapper does not exist yet.

**Step 3: Write the minimal implementation**
- Add a wrapper script around `runGatewayOpsChecks()`.
- Support scheduler-facing env/args such as:
  - `OPS_RUN_LABEL`
  - `OPS_DEPLOYMENT`
  - `OPS_NOTIFY_WEBHOOK_URL`
  - `OPS_PUBLISH_ARTIFACTS`
- Keep dry-run deterministic and machine-readable.
- Add the root script `ops:gateway:scheduled`.

**Step 4: Run the test to verify it passes**
- Run: `pnpm exec vitest run tests/workspace/gateway-ops-scheduled.test.ts`
- Run: `pnpm ops:gateway:scheduled -- --dry-run`
- Expected: PASS.

**Step 5: Commit**
```bash
git add scripts/ops/run-scheduled-gateway-verify.mjs tests/workspace/gateway-ops-scheduled.test.ts package.json README.md docs/deploy/edgeone.md
git commit -m "feat: add scheduled gateway ops wrapper"
```

---

### Task 3: Publish ops artifacts to S3-compatible object storage

**Files:**
- Modify: `package.json`
- Create: `scripts/ops/lib/object-store.mjs`
- Create: `scripts/ops/lib/publish-artifacts.mjs`
- Modify: `scripts/ops/run-scheduled-gateway-verify.mjs`
- Modify: `tests/workspace/gateway-ops-scheduled.test.ts`
- Modify: `docs/BETA_CHECKLIST.md`
- Modify: `docs/deploy/edgeone.md`

**Step 1: Write the failing test**
- Extend the scheduled ops wrapper test to assert live/mock mode can publish artifacts and return remote URLs in the wrapper summary.
- Cover at least:
  - publishing disabled
  - publishing enabled with mock object storage
  - manifest including both local relative paths and remote URLs

**Step 2: Run the test to verify it fails**
- Run: `pnpm exec vitest run tests/workspace/gateway-ops-scheduled.test.ts`
- Expected: FAIL because no object-store publisher exists yet.

**Step 3: Write the minimal implementation**
- Add S3-compatible publishing using env vars such as:
  - `OPS_ARTIFACT_BUCKET`
  - `OPS_ARTIFACT_PREFIX`
  - `OPS_ARTIFACT_REGION`
  - `OPS_ARTIFACT_ENDPOINT`
  - `OPS_ARTIFACT_ACCESS_KEY_ID`
  - `OPS_ARTIFACT_SECRET_ACCESS_KEY`
  - `OPS_ARTIFACT_PUBLIC_BASE_URL`
- Publish `manifest.json`, `smoke.json`, `benchmark.json`, and `summary.json` after a successful local run.
- Return compact remote URL metadata in the wrapper output.
- Keep provider provisioning outside the repo; only the contract and uploader live here.

**Step 4: Run the test to verify it passes**
- Run: `pnpm exec vitest run tests/workspace/gateway-ops-scheduled.test.ts`
- Expected: PASS.

**Step 5: Commit**
```bash
git add package.json scripts/ops/lib/object-store.mjs scripts/ops/lib/publish-artifacts.mjs scripts/ops/run-scheduled-gateway-verify.mjs tests/workspace/gateway-ops-scheduled.test.ts docs/BETA_CHECKLIST.md docs/deploy/edgeone.md
git commit -m "feat: publish gateway ops artifacts"
```

---

### Task 4: Add scheduled ops webhook summaries and heartbeat metadata

**Files:**
- Create: `scripts/ops/lib/send-ops-alert.mjs`
- Modify: `scripts/ops/run-scheduled-gateway-verify.mjs`
- Modify: `tests/workspace/gateway-ops-scheduled.test.ts`
- Modify: `README.md`
- Modify: `docs/BETA_CHECKLIST.md`
- Modify: `docs/deploy/edgeone.md`

**Step 1: Write the failing test**
- Extend the scheduled wrapper test so a synthetic threshold failure expects one compact webhook payload containing:
  - `run_label`
  - `deployment`
  - `status`
  - `failure_reasons`
  - artifact URL map when publish is enabled
- Also cover a success heartbeat payload when `OPS_NOTIFY_WEBHOOK_URL` is configured.

**Step 2: Run the test to verify it fails**
- Run: `pnpm exec vitest run tests/workspace/gateway-ops-scheduled.test.ts`
- Expected: FAIL because no notify layer exists yet.

**Step 3: Write the minimal implementation**
- Add a tiny webhook sender for scheduled ops runs.
- Emit one compact JSON summary per run; do not dump full benchmark payloads into the webhook body.
- Include threshold failures as the primary operator signal.
- Preserve non-zero exit codes when verification fails.

**Step 4: Run the test to verify it passes**
- Run: `pnpm exec vitest run tests/workspace/gateway-ops-scheduled.test.ts`
- Expected: PASS.

**Step 5: Commit**
```bash
git add scripts/ops/lib/send-ops-alert.mjs scripts/ops/run-scheduled-gateway-verify.mjs tests/workspace/gateway-ops-scheduled.test.ts README.md docs/BETA_CHECKLIST.md docs/deploy/edgeone.md
git commit -m "feat: notify on scheduled ops runs"
```

---

### Task 5: Add a gateway backup restore drill CLI

**Files:**
- Create: `scripts/smoke/gateway-backup-restore.mjs`
- Create: `tests/workspace/gateway-backup-restore.test.ts`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/deploy/edgeone.md`
- Modify: `docs/user/settings-backup-recovery.md`

**Step 1: Write the failing test**
- Add a workspace test proving a new root script `smoke:gateway-backup-restore` exists.
- Assert `pnpm smoke:gateway-backup-restore -- --dry-run` prints deterministic steps for:
  - reading `/admin/backups/latest`
  - validating the envelope via the shared protocol helper
  - reporting metadata needed for a restore drill
- Add a mock/live-mode assertion proving the script can consume a synthetic latest backup payload and emit a compact inspection summary.

**Step 2: Run the test to verify it fails**
- Run: `pnpm exec vitest run tests/workspace/gateway-backup-restore.test.ts`
- Expected: FAIL because the drill script does not exist yet.

**Step 3: Write the minimal implementation**
- Add a smoke script that reads the latest gateway backup via `GET /admin/backups/latest`.
- Validate the returned envelope with the shared protocol helper from Task 1.
- Output a small summary including:
  - `stored_at`
  - `schema_version`
  - `created_at`
  - `app_version`
  - `conversation_count`
- Keep this script operator-facing; do not mutate local browser state from Node.

**Step 4: Run the test to verify it passes**
- Run: `pnpm exec vitest run tests/workspace/gateway-backup-restore.test.ts`
- Run: `pnpm smoke:gateway-backup-restore -- --dry-run`
- Expected: PASS.

**Step 5: Commit**
```bash
git add scripts/smoke/gateway-backup-restore.mjs tests/workspace/gateway-backup-restore.test.ts package.json README.md docs/deploy/edgeone.md docs/user/settings-backup-recovery.md
git commit -m "feat: add gateway backup restore drill"
```

---

### Task 6: Persist an encrypted remote-backup admin token in web settings

**Files:**
- Modify: `apps/web/src/state/settings-store.ts`
- Modify: `apps/web/src/state/settings-store.test.ts`
- Modify: `apps/web/src/storage/backup.ts`
- Modify: `docs/user/settings-backup-recovery.md`

**Step 1: Write the failing tests**
- Extend the settings store tests to prove the app can:
  - save an encrypted gateway admin token
  - read/decrypt it for runtime backup actions
  - clear it cleanly
- Add one storage test proving remote backup import helpers can work with an envelope fetched from gateway without regressing local merge behavior.

**Step 2: Run the tests to verify they fail**
- Run: `pnpm --filter @geohelper/web test -- --run src/state/settings-store.test.ts src/storage/backup.test.ts`
- Expected: FAIL because no persisted remote-backup admin secret exists yet.

**Step 3: Write the minimal implementation**
- Add an encrypted settings field for the remote backup admin token using the existing browser secret service.
- Keep the token separate from BYOK secrets so backup sync stays optional and explicit.
- Expose small store actions for set/read/clear.

**Step 4: Run the tests to verify they pass**
- Run: `pnpm --filter @geohelper/web test -- --run src/state/settings-store.test.ts src/storage/backup.test.ts`
- Expected: PASS.

**Step 5: Commit**
```bash
git add apps/web/src/state/settings-store.ts apps/web/src/state/settings-store.test.ts apps/web/src/storage/backup.ts docs/user/settings-backup-recovery.md
git commit -m "feat: store remote backup admin secret"
```

---

### Task 7: Add explicit remote backup sync actions to the settings drawer

**Files:**
- Create: `apps/web/src/components/settings-remote-backup.ts`
- Create: `apps/web/src/components/settings-remote-backup.test.ts`
- Modify: `apps/web/src/components/SettingsDrawer.tsx`
- Modify: `apps/web/src/runtime/runtime-service.ts`
- Modify: `apps/web/src/runtime/gateway-client.ts`
- Modify: `apps/web/src/runtime/gateway-client.test.ts`
- Modify: `apps/web/src/storage/backup.ts`
- Modify: `apps/web/src/storage/backup.test.ts`
- Modify: `docs/user/settings-backup-recovery.md`

**Step 1: Write the failing tests**
- Add focused pure-helper tests for remote backup action state transitions:
  - disabled when no gateway runtime profile exists
  - disabled when no admin token is available
  - correct messaging for push success, pull success, and restore warnings
- Extend gateway client/runtime/storage tests to prove the web app can:
  - upload the current backup to gateway
  - fetch the latest gateway backup
  - restore the fetched backup through the existing local import helpers

**Step 2: Run the tests to verify they fail**
- Run: `pnpm --filter @geohelper/web test -- --run src/components/settings-remote-backup.test.ts src/runtime/gateway-client.test.ts src/storage/backup.test.ts`
- Expected: FAIL because the drawer has no explicit remote backup actions yet.

**Step 3: Write the minimal implementation**
- Add a small pure helper module to keep the drawer logic testable without introducing a heavy UI test stack.
- Add explicit `上传到网关`, `从网关拉取`, and `拉取后导入` actions to `SettingsDrawer.tsx`.
- Reuse the existing local export/import path; do not introduce background sync, conflict resolution services, or automatic polling.
- Keep remote backup opt-in and clearly operator-focused.

**Step 4: Run the tests to verify they pass**
- Run: `pnpm --filter @geohelper/web test -- --run src/components/settings-remote-backup.test.ts src/runtime/gateway-client.test.ts src/storage/backup.test.ts`
- Expected: PASS.

**Step 5: Commit**
```bash
git add apps/web/src/components/settings-remote-backup.ts apps/web/src/components/settings-remote-backup.test.ts apps/web/src/components/SettingsDrawer.tsx apps/web/src/runtime/runtime-service.ts apps/web/src/runtime/gateway-client.ts apps/web/src/runtime/gateway-client.test.ts apps/web/src/storage/backup.ts apps/web/src/storage/backup.test.ts docs/user/settings-backup-recovery.md
git commit -m "feat: add settings remote backup sync"
```

---

### Task 8: Final verification and V5 release-gate refresh

**Files:**
- Modify: `README.md`
- Modify: `docs/BETA_CHECKLIST.md`
- Modify: `docs/deploy/edgeone.md`
- Modify: `docs/user/settings-backup-recovery.md`
- Verify: `apps/gateway/**`
- Verify: `apps/web/**`
- Verify: `packages/protocol/**`
- Verify: `tests/**`

**Step 1: Run protocol + gateway tests**
- Run: `pnpm --filter @geohelper/protocol test`
- Run: `pnpm --filter @geohelper/gateway test`
- Expected: PASS.

**Step 2: Run focused web tests**
- Run: `pnpm --filter @geohelper/web test -- --run src/state/settings-store.test.ts src/components/settings-remote-backup.test.ts src/runtime/gateway-client.test.ts src/storage/backup.test.ts src/runtime/direct-client.test.ts`
- Expected: PASS.

**Step 3: Run workspace script/doc tests**
- Run: `pnpm exec vitest run tests/workspace/gateway-ops-runner.test.ts tests/workspace/gateway-ops-scheduled.test.ts tests/workspace/gateway-backup-restore.test.ts tests/workspace/benchmark-runner.test.ts tests/workspace/deploy-docs.test.ts tests/workspace/beta-checklist.test.ts`
- Expected: PASS.

**Step 4: Run workspace typecheck + build**
- Run: `pnpm typecheck`
- Run: `pnpm --filter @geohelper/web build`
- Expected: PASS.

**Step 5: Run dry-run operator commands**
- Run: `pnpm ops:gateway:verify -- --dry-run`
- Run: `pnpm ops:gateway:scheduled -- --dry-run`
- Run: `pnpm smoke:gateway-runtime -- --dry-run`
- Run: `pnpm smoke:gateway-backup-restore -- --dry-run`
- Expected: PASS.

**Step 6: Refresh release gates**
- Update docs so operators know:
  - scheduled ops verification is the recurring entrypoint
  - published artifacts are the source of truth for post-deploy evidence
  - threshold failures and failed restore drills block release promotion
  - gateway latest-backup recovery is explicit and single-tenant
  - remote backup UI remains opt-in and requires a configured admin token

**Step 7: Commit**
```bash
git add README.md docs/BETA_CHECKLIST.md docs/deploy/edgeone.md docs/user/settings-backup-recovery.md
git commit -m "docs: refresh backend v5 ops closure gates"
```

---

## Deferred Follow-Ups (Do Not Start In This Plan)

- Provider-specific scheduler/IaC provisioning (GitHub Actions, Cloudflare cron, systemd timers, etc.).
- Multi-tenant backup catalogs or end-user cloud sync.
- SQL/object-relational metadata stores.
- Attachments/vision runtime support.
- User accounts, billing, or generalized admin UI.

## Delivery Notes

- Treat this roadmap as `Gateway V5 Ops Closure & Remote Recovery`, not a product-backend expansion.
- Prefer repo-local scripts + admin route composition before inventing a new service plane.
- Keep every mutable action explicit and operator-driven.
- If a task drifts toward generic cloud sync or multi-user workflows, cut it.
