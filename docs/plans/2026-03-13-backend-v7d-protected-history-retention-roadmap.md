# Backend V7-D Protected History Retention Roadmap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend Route 1 lightweight cloud sync with protected remote snapshots and explicit retention rules so important recovery points are never silently pruned by newer routine backups.

**Architecture:** Keep GeoHelper local-first and snapshot-based. Build on V7-C retained snapshot history by splitting remote retention into two bounded classes: normal history and manually protected snapshots. The browser remains the live editing authority, the gateway remains a single-tenant snapshot store, and recovery stays explicit through settings/admin actions. Do not add SQL, message-level sync, server-authoritative chat history, automatic merge, or background reconciliation.

**Tech Stack:** `@geohelper/protocol`, Fastify admin backup routes, Redis-compatible KV snapshot storage, React + Zustand settings UI, existing remote backup runtime client, Vitest workspace tests, Playwright settings coverage.

**Status (2026-03-13):** Implemented and locally verified in `codex/backend-v7d-protected-history-retention`.

- Target scope: protected snapshot metadata, bounded protected retention, explicit protect/unprotect APIs, settings affordances, and docs/release-gate refresh.
- Completed scope:
  - protected snapshot metadata in gateway backup models and responses
  - explicit `BACKUP_MAX_HISTORY` / `BACKUP_MAX_PROTECTED` retention controls
  - admin protect/unprotect routes with explicit `409` capacity semantics
  - web runtime client + settings UI for `保护此快照` / `取消保护`
  - docs and release gates covering bounded ordinary/protected retention
- Confirmed product choices:
  - ordinary history keeps the newest `N` entries
  - protected snapshots keep a separate maximum `M`
  - protected snapshots do not auto-expire
  - when protected capacity is full, new protect requests fail with `409`
  - limits are configured by environment variables
- Required semantic correction versus current Redis behavior:
  - protected snapshots must not be removed by the current implicit 30-day TTL in `apps/gateway/src/services/redis-backup-store.ts`
  - retention must be governed by explicit bounded-count rules, not silent TTL expiry
- Verification evidence:
  - `pnpm --filter @geohelper/gateway test -- test/config-secret.test.ts test/admin-backups.test.ts test/redis-backup-store.test.ts`
  - `pnpm --filter @geohelper/web test -- --run src/runtime/gateway-client.test.ts src/components/settings-remote-backup.test.ts src/state/settings-store.test.ts src/storage/remote-sync.test.ts`
  - `pnpm exec vitest run tests/workspace/gateway-backup-restore.test.ts tests/workspace/beta-checklist.test.ts tests/workspace/deploy-docs.test.ts tests/workspace/remote-sync-docs.test.ts`
  - `pnpm --filter @geohelper/protocol test`
  - `pnpm --filter @geohelper/gateway test`
  - `pnpm --filter @geohelper/web test`
  - `pnpm typecheck`
  - `pnpm smoke:gateway-backup-restore -- --dry-run`
  - `pnpm ops:gateway:scheduled -- --dry-run`
  - `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "remote backup|protected snapshot|force overwrite"`
- Scoped deferrals:
  - none for V7-D; SQL/general cloud chat history remains explicitly out of scope for this route

---

## Phase Map

- `P0`: Extend backup models so retained snapshots can be marked protected and queried precisely.
- `P1`: Move gateway retention enforcement onto explicit normal/protected limits with env-driven config.
- `P2`: Add authenticated admin protect/unprotect/history surfaces and conflict semantics.
- `P3`: Expose protected snapshot controls in the web runtime and settings recovery UI.
- `P4`: Refresh docs, release gates, and focused verification for protected retention.
- Out of scope: SQL/OLTP business tables, server-authoritative cloud history, auto-merge daemons, multi-user workspaces, attachment blob lifecycle work, automatic protected expiry.

---

### Task 1: Extend backup store types for protected snapshot retention

**Files:**
- Modify: `apps/gateway/src/services/backup-store.ts`
- Modify: `apps/gateway/test/redis-backup-store.test.ts`
- Modify: `apps/gateway/test/admin-backups.test.ts`

**Step 1: Write the failing tests**
- Extend backup store tests to assert retained history entries can carry protected metadata:
  - `isProtected`
  - `protectedAt`
- Add expectations for store primitives the rest of V7-D needs:
  - read retained history with protected flags preserved
  - protect an existing retained snapshot
  - unprotect an existing retained snapshot
  - reject protect attempts for unknown snapshot ids
  - reject protect attempts when protected capacity is full
- Extend route tests with placeholder expectations for future serialized fields so response-shape drift is caught early.

**Step 2: Run the tests to verify they fail**
- Run: `pnpm --filter @geohelper/gateway test -- test/redis-backup-store.test.ts test/admin-backups.test.ts`
- Expected: FAIL because retained backup summaries currently have no protected metadata and the store exposes no protect/unprotect primitive.

**Step 3: Write the minimal implementation**
- Extend `GatewayBackupSummary` and `GatewayBackupRecord` with:
  - `isProtected: boolean`
  - `protectedAt?: string`
- Extend `GatewayBackupStore` with explicit protected-retention primitives, for example:
  - `protectSnapshot(snapshotId)`
  - `unprotectSnapshot(snapshotId)`
  - `readProtectedHistory(limit?)`
- Keep `readLatest()`, `readHistory()`, and `readSnapshot()` backward compatible.
- Normalize protection semantics in one place so both memory and Redis stores share the same rules.

**Step 4: Run the tests to verify they pass**
- Run the same gateway tests from Step 2.
- Expected: PASS.

**Step 5: Commit**
```bash
git add apps/gateway/src/services/backup-store.ts apps/gateway/test/redis-backup-store.test.ts apps/gateway/test/admin-backups.test.ts
git commit -m "feat: add protected snapshot backup store model"
```

---

### Task 2: Replace TTL-led pruning with explicit normal/protected retention limits

**Files:**
- Modify: `apps/gateway/src/config.ts`
- Modify: `apps/gateway/src/server.ts`
- Modify: `apps/gateway/src/services/backup-store.ts`
- Modify: `apps/gateway/src/services/redis-backup-store.ts`
- Modify: `apps/gateway/test/config-secret.test.ts`
- Modify: `apps/gateway/test/redis-backup-store.test.ts`

**Step 1: Write the failing tests**
- Add config tests for:
  - `BACKUP_MAX_HISTORY`
  - `BACKUP_MAX_PROTECTED`
- Extend Redis backup store tests to assert:
  - ordinary writes prune only unprotected history beyond `BACKUP_MAX_HISTORY`
  - protected snapshots survive ordinary-history pruning
  - when protected count reaches `BACKUP_MAX_PROTECTED`, a new protect request returns a capacity result instead of silently rotating old protected entries
  - unprotecting a snapshot makes it eligible for later ordinary pruning
  - protected snapshots are not written with an expiring TTL that can silently delete them later

**Step 2: Run the tests to verify they fail**
- Run: `pnpm --filter @geohelper/gateway test -- test/config-secret.test.ts test/redis-backup-store.test.ts`
- Expected: FAIL because gateway config does not expose retention env vars and Redis retention still depends on one bounded history list plus expiring snapshot keys.

**Step 3: Write the minimal implementation**
- Add `backupMaxHistory` and `backupMaxProtected` to gateway config with defaults:
  - `BACKUP_MAX_HISTORY=10`
  - `BACKUP_MAX_PROTECTED=20`
- Pass those values through `apps/gateway/src/server.ts` into the selected backup store.
- Refactor Redis retention so:
  - latest summary remains easy to read
  - normal retained history and protected retained history are bounded separately
  - protected snapshots are stored without an auto-expiring TTL
  - only snapshots no longer referenced by either retention class are deleted
- Keep ordinary history bounded and explicit; do not introduce unbounded retention.

**Step 4: Run the tests to verify they pass**
- Run the same gateway test command from Step 2.
- Expected: PASS.

**Step 5: Commit**
```bash
git add apps/gateway/src/config.ts apps/gateway/src/server.ts apps/gateway/src/services/backup-store.ts apps/gateway/src/services/redis-backup-store.ts apps/gateway/test/config-secret.test.ts apps/gateway/test/redis-backup-store.test.ts
git commit -m "feat: add explicit protected snapshot retention limits"
```

---

### Task 3: Add admin APIs for protect/unprotect and richer history inspection

**Files:**
- Modify: `apps/gateway/src/routes/admin.ts`
- Modify: `apps/gateway/test/admin-backups.test.ts`
- Modify: `apps/web/src/runtime/types.ts`
- Modify: `apps/web/src/runtime/gateway-client.ts`
- Modify: `apps/web/src/runtime/gateway-client.test.ts`

**Step 1: Write the failing tests**
- Extend admin route tests to cover authenticated endpoints such as:
  - `POST /admin/backups/history/:snapshotId/protect`
  - `DELETE /admin/backups/history/:snapshotId/protect`
- Assert:
  - protect returns `200` with updated summary when the snapshot exists
  - protect returns `404` for unknown snapshot ids
  - protect returns `409` when protected capacity is full
  - unprotect returns `200` and clears protected metadata
  - `403` is still returned when `x-admin-token` is invalid
- Extend gateway-client tests to assert the web runtime can call these endpoints and preserve protected flags in history/list/download payloads.

**Step 2: Run the tests to verify they fail**
- Run: `pnpm --filter @geohelper/gateway test -- test/admin-backups.test.ts`
- Run: `pnpm --filter @geohelper/web test -- --run src/runtime/gateway-client.test.ts`
- Expected: FAIL because the gateway exposes no protect/unprotect routes and runtime types currently cannot model protected history metadata.

**Step 3: Write the minimal implementation**
- Serialize `is_protected` and `protected_at` in all backup summary/record responses.
- Add one explicit protect route and one explicit unprotect route on the existing admin surface.
- Return a compact `409` payload for protected-capacity exhaustion; do not auto-demote older protected snapshots.
- Extend runtime types and gateway client helpers for:
  - protected history summary fields
  - protect snapshot request
  - unprotect snapshot request
- Keep the latest-download and selected-history-download flow backward compatible.

**Step 4: Run the tests to verify they pass**
- Run the same commands from Step 2.
- Expected: PASS.

**Step 5: Commit**
```bash
git add apps/gateway/src/routes/admin.ts apps/gateway/test/admin-backups.test.ts apps/web/src/runtime/types.ts apps/web/src/runtime/gateway-client.ts apps/web/src/runtime/gateway-client.test.ts
git commit -m "feat: add admin protected snapshot controls"
```

---

### Task 4: Surface protected snapshot controls in settings and recovery flows

**Files:**
- Modify: `apps/web/src/components/settings-remote-backup.ts`
- Modify: `apps/web/src/components/settings-remote-backup.test.ts`
- Modify: `apps/web/src/components/SettingsDrawer.tsx`
- Modify: `apps/web/src/state/settings-store.ts`
- Modify: `apps/web/src/state/settings-store.test.ts`
- Modify: `apps/web/src/storage/remote-sync.ts`
- Modify: `apps/web/src/storage/remote-sync.test.ts`
- Modify: `tests/e2e/settings-drawer.spec.ts`

**Step 1: Write the failing tests**
- Extend helper/component tests so the remote backup section can:
  - display protected badges in retained history
  - show protected-count usage alongside ordinary history count
  - protect the currently selected retained snapshot
  - unprotect a protected snapshot explicitly
  - surface a friendly error when protected capacity is exhausted
- Extend settings/remote-sync tests to assert:
  - protected metadata remains visible after compare/check flows refresh history
  - unprotecting a snapshot does not silently import or overwrite anything
  - blocked/conflict recovery messaging can recommend protecting a chosen recovery point before further experimentation
- Extend Playwright coverage for:
  - check remote status
  - protect a selected retained snapshot
  - see the protected badge after refresh
  - hit the explicit protected-capacity error path using mocked responses

**Step 2: Run the tests to verify they fail**
- Run: `pnpm --filter @geohelper/web test -- --run src/components/settings-remote-backup.test.ts src/state/settings-store.test.ts src/storage/remote-sync.test.ts`
- Run: `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "protected snapshot|remote backup"`
- Expected: FAIL because the settings UI currently treats all retained snapshots the same and has no protect/unprotect affordance.

**Step 3: Write the minimal implementation**
- Reuse the existing retained-history list instead of inventing a second recovery screen.
- Add explicit actions near the selected history snapshot:
  - `保护此快照`
  - `取消保护`
- Keep protection a metadata operation only:
  - no auto-download
  - no auto-import
  - no auto-overwrite
- Preserve the Route 1 mental model: protect a recovery anchor, then explicitly pull/import if needed.

**Step 4: Run the tests to verify they pass**
- Run the same commands from Step 2.
- Expected: PASS.

**Step 5: Commit**
```bash
git add apps/web/src/components/settings-remote-backup.ts apps/web/src/components/settings-remote-backup.test.ts apps/web/src/components/SettingsDrawer.tsx apps/web/src/state/settings-store.ts apps/web/src/state/settings-store.test.ts apps/web/src/storage/remote-sync.ts apps/web/src/storage/remote-sync.test.ts tests/e2e/settings-drawer.spec.ts
git commit -m "feat: add protected snapshot settings controls"
```

---

### Task 5: Refresh docs and release gates for explicit retention policy

**Files:**
- Modify: `README.md`
- Modify: `docs/BETA_CHECKLIST.md`
- Modify: `docs/deploy/edgeone.md`
- Modify: `docs/user/settings-backup-recovery.md`
- Modify: `tests/workspace/gateway-backup-restore.test.ts`
- Modify: `tests/workspace/beta-checklist.test.ts`
- Modify: `tests/workspace/deploy-docs.test.ts`
- Modify: `tests/workspace/remote-sync-docs.test.ts`

**Step 1: Write the failing tests**
- Extend workspace doc tests so documentation must mention:
  - ordinary retained history and protected retained snapshots are bounded separately
  - protected snapshots do not auto-expire
  - new protect requests fail explicitly when protected capacity is full
  - Route 1 remains snapshot-based and still does not add SQL or full cloud history
  - settings protection is manual metadata only and does not imply import/restore

**Step 2: Run the tests to verify they fail**
- Run: `pnpm exec vitest run tests/workspace/gateway-backup-restore.test.ts tests/workspace/beta-checklist.test.ts tests/workspace/deploy-docs.test.ts tests/workspace/remote-sync-docs.test.ts`
- Expected: FAIL because current docs mention retained history browsing but not protected retention policy or the new env controls.

**Step 3: Write the minimal implementation**
- Update operator/user docs to explain:
  - why a snapshot should be protected
  - how to protect/unprotect it
  - how `BACKUP_MAX_HISTORY` and `BACKUP_MAX_PROTECTED` affect self-hosted retention
  - that protection does not replace explicit pull/import decisions
- Keep docs honest about what still does not exist:
  - no SQL
  - no automatic cloud chat history
  - no hidden background merge

**Step 4: Run the tests to verify they pass**
- Run the same workspace doc tests from Step 2.
- Expected: PASS.

**Step 5: Commit**
```bash
git add README.md docs/BETA_CHECKLIST.md docs/deploy/edgeone.md docs/user/settings-backup-recovery.md tests/workspace/gateway-backup-restore.test.ts tests/workspace/beta-checklist.test.ts tests/workspace/deploy-docs.test.ts tests/workspace/remote-sync-docs.test.ts
git commit -m "docs: add protected snapshot retention guidance"
```

---

### Task 6: Run final verification and refresh roadmap status

**Files:**
- Modify: `docs/plans/2026-03-13-backend-v7d-protected-history-retention-roadmap.md`

**Step 1: Run targeted package tests**
- Run: `pnpm --filter @geohelper/gateway test -- test/config-secret.test.ts test/admin-backups.test.ts test/redis-backup-store.test.ts`
- Run: `pnpm --filter @geohelper/web test -- --run src/runtime/gateway-client.test.ts src/components/settings-remote-backup.test.ts src/state/settings-store.test.ts src/storage/remote-sync.test.ts`
- Run: `pnpm exec vitest run tests/workspace/gateway-backup-restore.test.ts tests/workspace/beta-checklist.test.ts tests/workspace/deploy-docs.test.ts tests/workspace/remote-sync-docs.test.ts`

**Step 2: Run broader regression gates**
- Run: `pnpm --filter @geohelper/protocol test`
- Run: `pnpm --filter @geohelper/gateway test`
- Run: `pnpm --filter @geohelper/web test`
- Run: `pnpm typecheck`
- Run: `pnpm smoke:gateway-backup-restore -- --dry-run`
- Run: `pnpm ops:gateway:scheduled -- --dry-run`
- Run: `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "remote backup|protected snapshot|force overwrite"`
- Expected: PASS, or document any unrelated pre-existing failures explicitly before claiming V7-D complete.

**Step 3: Refresh roadmap status**
- Update this roadmap with completion notes once code lands:
  - implemented branch/commit summary
  - verification evidence
  - any scoped deferrals left for a future V7-E

**Step 4: Commit release-gate refresh**
```bash
git add docs/plans/2026-03-13-backend-v7d-protected-history-retention-roadmap.md
git commit -m "docs: mark backend v7d protected retention verified"
```
