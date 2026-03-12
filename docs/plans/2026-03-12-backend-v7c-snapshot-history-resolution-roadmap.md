# Backend V7-C Snapshot History Resolution Roadmap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend Route 1 lightweight cloud sync so blocked/conflicted browser sync states can be resolved through explicit remote snapshot history inspection and selected-snapshot recovery, without introducing SQL or server-authoritative cloud history.

**Architecture:** Keep GeoHelper local-first and snapshot-based. Reuse the guarded write model from V7-B, but add one more missing operator/user capability: once the browser refuses to overwrite a newer/diverged remote snapshot, the user should be able to inspect retained remote snapshot history, fetch a specific snapshot by `snapshot_id`, preview it, and explicitly import it with the existing merge/replace recovery flow. Gateway remains a single-tenant snapshot store plus bounded history; do not add message-level storage, auto-merge daemons, or SQL/OLTP business tables.

**Tech Stack:** `@geohelper/protocol`, Fastify admin backup routes, Redis-compatible KV history retention, React + Zustand settings UI, existing backup import helpers, Vitest workspace tests, Playwright settings coverage.

**Status (2026-03-12):** Implemented locally in `codex/backend-v7c-snapshot-history-resolution`.

- Completed scope: Tasks 1-5 are landed in code.
- Verified locally: `pnpm --filter @geohelper/protocol test`, `pnpm --filter @geohelper/gateway test`, `pnpm --filter @geohelper/web test`, workspace doc/ops tests, `pnpm smoke:gateway-backup-restore -- --dry-run`, `pnpm ops:gateway:scheduled -- --dry-run`, `pnpm typecheck`, and targeted remote-backup Playwright coverage all pass.
- Known unrelated coverage gap: a full run of `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts` still reports pre-existing failures outside V7-C scope in BYOK preset/apply, backup import preview/import, and short-landscape import-layout assertions. Targeted remote-backup scenarios introduced by V7-C pass.

---

## Phase Map

- `P0`: Add exact remote history snapshot fetch primitives on gateway/runtime.
- `P1`: Surface remote history browsing and selected-snapshot preview/import in settings.
- `P2`: Make blocked/conflict states actionable through explicit pull-resolution UX.
- `P3`: Refresh docs, release gates, and focused smoke coverage around selected-snapshot recovery.
- Out of scope: SQL/OLTP storage, server-authoritative cloud history, background pull/merge, real-time collaboration, user accounts, multi-tenant workspaces, attachment/media object sync.

---

### Task 1: Add gateway support for fetching one retained snapshot by `snapshot_id`

**Files:**
- Modify: `apps/gateway/src/services/backup-store.ts`
- Modify: `apps/gateway/src/services/redis-backup-store.ts`
- Modify: `apps/gateway/src/routes/admin.ts`
- Modify: `apps/gateway/test/redis-backup-store.test.ts`
- Modify: `apps/gateway/test/admin-backups.test.ts`

**Step 1: Write the failing tests**
- Extend store tests so backup history can be queried by an exact `snapshot_id`.
- Assert:
  - a retained snapshot can be read back with full envelope
  - latest and historical snapshots can both be fetched when present
  - unknown `snapshot_id` returns `null`
  - reading one historical snapshot does not mutate latest/history ordering
- Extend admin route tests to cover a new authenticated endpoint such as `GET /admin/backups/history/:snapshotId`, asserting:
  - `200` with full backup record when the snapshot exists
  - `404` when the snapshot does not exist
  - `403` when `x-admin-token` is invalid

**Step 2: Run the tests to verify they fail**
- Run: `pnpm --filter @geohelper/gateway test -- test/admin-backups.test.ts test/redis-backup-store.test.ts`
- Expected: FAIL because gateway history is currently list-only and cannot fetch one retained snapshot by id.

**Step 3: Write the minimal implementation**
- Extend `GatewayBackupStore` with one exact-read primitive, for example `readSnapshot(snapshotId)`.
- Keep `readLatest()` and `readHistory()` untouched for backward compatibility.
- Reuse retained history data already stored in memory/Redis; do not add a new datastore.
- Add one admin route that returns a full backup record for a retained snapshot, reusing the existing backup serialization shape.

**Step 4: Run the tests to verify they pass**
- Run the same gateway tests from Step 2.
- Expected: PASS.

**Step 5: Commit**
```bash
git add apps/gateway/src/services/backup-store.ts apps/gateway/src/services/redis-backup-store.ts apps/gateway/src/routes/admin.ts apps/gateway/test/redis-backup-store.test.ts apps/gateway/test/admin-backups.test.ts
git commit -m "feat: add retained backup snapshot fetch route"
```

---

### Task 2: Add web runtime support for selected-snapshot download

**Files:**
- Modify: `apps/web/src/runtime/types.ts`
- Modify: `apps/web/src/runtime/gateway-client.ts`
- Modify: `apps/web/src/runtime/gateway-client.test.ts`
- Modify: `apps/web/src/runtime/runtime-service.ts`

**Step 1: Write the failing tests**
- Extend runtime client tests so web code can request:
  - latest backup as today
  - one retained backup by explicit `snapshot_id`
- Assert the client:
  - calls the new gateway route correctly
  - preserves metadata + envelope shape for a selected history snapshot
  - still keeps the existing latest-download helper working

**Step 2: Run the tests to verify they fail**
- Run: `pnpm --filter @geohelper/web test -- --run src/runtime/gateway-client.test.ts`
- Expected: FAIL because runtime download currently only supports the latest snapshot.

**Step 3: Write the minimal implementation**
- Add one typed request/response path for selected-snapshot download, either:
  - a new helper, or
  - an optional `snapshotId` branch in the existing helper if that keeps the API cleaner
- Keep the latest snapshot path backward compatible for existing settings flows.
- Do not add message-level patch/diff transport in this phase.

**Step 4: Run the tests to verify they pass**
- Run the same web test command from Step 2.
- Expected: PASS.

**Step 5: Commit**
```bash
git add apps/web/src/runtime/types.ts apps/web/src/runtime/gateway-client.ts apps/web/src/runtime/gateway-client.test.ts apps/web/src/runtime/runtime-service.ts
git commit -m "feat: add selected remote snapshot download support"
```

---

### Task 3: Surface remote history browsing and selected-snapshot preview in settings

**Files:**
- Modify: `apps/web/src/components/settings-remote-backup.ts`
- Modify: `apps/web/src/components/settings-remote-backup.test.ts`
- Modify: `apps/web/src/components/SettingsDrawer.tsx`
- Modify: `tests/e2e/settings-drawer.spec.ts`

**Step 1: Write the failing tests**
- Extend helper/component tests so the remote backup section can:
  - show a remote history list after `检查云端状态`
  - mark the latest snapshot distinctly
  - show `snapshot_id`, `device_id`, `updated_at`, and conversation count for the selected history entry
  - expose an explicit action to fetch/preview a selected historical snapshot
- Extend Playwright coverage so a user can:
  - check remote status
  - see more than one retained snapshot
  - select a non-latest snapshot
  - fetch that selected snapshot without overwriting local data yet
  - see merge/replace import actions against the selected snapshot preview

**Step 2: Run the tests to verify they fail**
- Run: `pnpm --filter @geohelper/web test -- --run src/components/settings-remote-backup.test.ts`
- Run: `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "remote history|selected snapshot"`
- Expected: FAIL because settings currently only supports latest-snapshot pull and has no history browser.

**Step 3: Write the minimal implementation**
- Reuse existing `history` data already stored in remote sync state.
- Add one compact history list in `设置` -> `数据与安全` -> `网关远端备份`.
- Allow one selected history entry at a time.
- Keep import destructive actions behind explicit button presses; selecting a history entry must not mutate local storage by itself.
- Reuse the existing pulled-backup preview/import UI where possible instead of inventing a second recovery surface.

**Step 4: Run the tests to verify they pass**
- Run the same commands from Step 2.
- Expected: PASS.

**Step 5: Commit**
```bash
git add apps/web/src/components/settings-remote-backup.ts apps/web/src/components/settings-remote-backup.test.ts apps/web/src/components/SettingsDrawer.tsx tests/e2e/settings-drawer.spec.ts
git commit -m "feat: add remote snapshot history selection UI"
```

---

### Task 4: Make blocked/conflict states resolve through explicit selected-snapshot recovery

**Files:**
- Modify: `apps/web/src/components/SettingsDrawer.tsx`
- Modify: `apps/web/src/storage/remote-sync.ts`
- Modify: `apps/web/src/storage/remote-sync.test.ts`
- Modify: `apps/web/src/state/settings-store.ts`
- Modify: `apps/web/src/state/settings-store.test.ts`

**Step 1: Write the failing tests**
- Extend remote sync + settings tests to assert:
  - blocked/conflict states can surface the last known remote history entry as the recommended resolution anchor
  - fetching and importing a selected remote snapshot clears the stale blocked/conflict presentation on next load/check
  - conflict-resolution messaging now points users toward explicit history inspection instead of only “拉取最新快照”
- Add one regression proving history inspection itself does not restart delayed upload or silently change remote sync status.

**Step 2: Run the tests to verify they fail**
- Run: `pnpm --filter @geohelper/web test -- --run src/storage/remote-sync.test.ts src/state/settings-store.test.ts src/components/settings-remote-backup.test.ts`
- Expected: FAIL because the current conflict flow only distinguishes latest pull / force overwrite and does not model selected-history recovery guidance.

**Step 3: Write the minimal implementation**
- Keep remote sync state compact; do not turn it into a full sync session journal.
- If additional UI state is needed for the selected history entry, keep it component-local unless it must survive reload.
- Preserve the guarded upload contract from V7-B; this task is about better manual resolution, not weakening overwrite safety.

**Step 4: Run the tests to verify they pass**
- Run the same web test command from Step 2.
- Expected: PASS.

**Step 5: Commit**
```bash
git add apps/web/src/components/SettingsDrawer.tsx apps/web/src/storage/remote-sync.ts apps/web/src/storage/remote-sync.test.ts apps/web/src/state/settings-store.ts apps/web/src/state/settings-store.test.ts
git commit -m "feat: add selected snapshot conflict resolution flow"
```

---

### Task 5: Refresh docs and release gates for selected-snapshot recovery

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
- Extend workspace doc tests so docs now mention:
  - retained remote snapshot history can be inspected explicitly
  - users can fetch a selected historical snapshot by `snapshot_id`
  - blocked/conflict sync states should be resolved through explicit pull/import or explicit overwrite
  - Route 1 remains snapshot-based and still does not require SQL/full cloud history
- Prevent drift toward language implying automatic history merge or hidden conflict resolution.

**Step 2: Run the tests to verify they fail**
- Run: `pnpm exec vitest run tests/workspace/gateway-backup-restore.test.ts tests/workspace/beta-checklist.test.ts tests/workspace/deploy-docs.test.ts tests/workspace/remote-sync-docs.test.ts`
- Expected: FAIL because current docs describe latest-only recovery and guarded overwrite protection, but not selected-history resolution.

**Step 3: Write the minimal implementation**
- Update docs to explain the new resolution flow precisely.
- Keep docs honest:
  - history inspection is explicit
  - selected-snapshot import is explicit
  - force overwrite stays dangerous and explicit
  - SQL/full cloud history is still out of scope

**Step 4: Run the tests to verify they pass**
- Run the same workspace test command from Step 2.
- Expected: PASS.

**Step 5: Commit**
```bash
git add README.md docs/BETA_CHECKLIST.md docs/deploy/edgeone.md docs/user/settings-backup-recovery.md tests/workspace/gateway-backup-restore.test.ts tests/workspace/beta-checklist.test.ts tests/workspace/deploy-docs.test.ts tests/workspace/remote-sync-docs.test.ts
git commit -m "docs: add selected snapshot recovery guidance"
```

---

### Task 6: Final verification and V7-C release gate refresh

**Files:**
- Modify: `docs/plans/2026-03-12-backend-v7c-snapshot-history-resolution-roadmap.md`

**Step 1: Run protocol, gateway, web, and workspace verification**
- Run: `pnpm --filter @geohelper/protocol test`
- Run: `pnpm --filter @geohelper/gateway test`
- Run: `pnpm --filter @geohelper/web test -- --run src/storage/backup.test.ts src/storage/remote-sync.test.ts src/runtime/gateway-client.test.ts src/state/settings-store.test.ts src/components/settings-remote-backup.test.ts`
- Run: `pnpm exec vitest run tests/workspace/gateway-backup-restore.test.ts tests/workspace/gateway-ops-runner.test.ts tests/workspace/gateway-ops-scheduled.test.ts tests/workspace/beta-checklist.test.ts tests/workspace/deploy-docs.test.ts tests/workspace/remote-sync-docs.test.ts`
- Run: `pnpm typecheck`

**Step 2: Run focused smoke / browser verification**
- Run: `pnpm smoke:gateway-backup-restore -- --dry-run`
- Run: `pnpm ops:gateway:scheduled -- --dry-run`
- Run: `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "remote history|selected snapshot|force overwrite"`
- Expected: PASS, or document any pre-existing unrelated failures explicitly before release claims.

**Step 3: Refresh plan status notes**
- Update this roadmap with a short completion note or status marker once implementation lands.
- Keep deferred follow-ups separate from the completed scope.

**Step 4: Commit merged release-gate refresh**
```bash
git add docs/plans/2026-03-12-backend-v7c-snapshot-history-resolution-roadmap.md
git commit -m "docs: refresh backend v7c snapshot history roadmap"
```

**Step 5: Merge / handoff**
- Merge the completed branch back into `main` only after the verification commands above are fresh and green.
- Clean up temporary worktrees after merge.

---

## Deferred Follow-Ups (Do Not Start In This Plan)

- SQL-backed conversation/message storage.
- True server-authoritative cloud history sync.
- Automatic background pull and merge.
- Multi-device live conflict resolution.
- Multi-tenant user/workspace isolation.
- Attachment/media object sync.

## Delivery Notes

- Treat this roadmap as the next Route 1 step: make conflict resolution actionable before broadening backend scope.
- The browser remains the live editing authority.
- Gateway backup retention remains single-tenant and snapshot-based.
- Selected-snapshot recovery is explicit operator/user intent, not hidden background reconciliation.
