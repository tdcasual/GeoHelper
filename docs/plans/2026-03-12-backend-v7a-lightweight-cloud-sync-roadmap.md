# Backend V7-A Lightweight Cloud Sync Roadmap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the current single-tenant remote backup flow into a local-first lightweight cloud sync system that helps personal self-hosted users keep chat history recoverable across devices without turning GeoHelper into a full cloud chat backend.

**Architecture:** Reuse the existing backup envelope, gateway admin backup surface, and local-first browser stores as the foundation. Keep the sync unit at the snapshot level rather than the message level: the browser still owns the working state, while the gateway stores validated backup snapshots plus compact comparison metadata. Add explicit remote freshness checks, compare summaries, and optional delayed auto-upload, but do not add SQL storage, user accounts, real-time collaboration, or message-by-message server authority.

**Tech Stack:** `@geohelper/protocol`, Fastify admin routes, Redis-compatible KV, Vitest workspace tests, React + Zustand, Dexie/localStorage, existing backup/restore helpers, existing gateway ops/smoke scripts.

---

## Phase Map

- `P0`: Extend the shared backup protocol with sync metadata and deterministic compare helpers.
- `P1`: Add gateway-side snapshot history / compare APIs on top of the current single-tenant backup slot.
- `P2`: Add web-side remote freshness awareness, compare prompts, and explicit recovery UX.
- `P3`: Add conservative delayed auto-upload for users who opt in, while preserving local-first control.
- Out of scope: SQL/OLTP storage, message-level cloud history, user accounts, multi-tenant workspaces, live collaboration, background pull/auto-merge, attachment/media object storage.

---

### Task 1: Extend the shared backup envelope for lightweight cloud sync metadata

**Files:**
- Modify: `packages/protocol/src/backup.ts`
- Modify: `packages/protocol/src/index.ts`
- Modify: `packages/protocol/test/backup.test.ts`
- Modify: `apps/web/src/storage/backup.ts`
- Modify: `apps/web/src/storage/backup.test.ts`
- Modify: `apps/gateway/src/services/backup-store.ts`
- Modify: `apps/gateway/test/redis-backup-store.test.ts`

**Step 1: Write the failing tests**
- Extend protocol tests so backup envelopes must support sync metadata such as:
  - `snapshot_id`
  - `device_id`
  - `updated_at`
  - optional `base_snapshot_id`
- Add a compare-oriented inspection helper expectation that can summarize:
  - whether two envelopes have the same checksum
  - which one is newer by `updated_at`
  - whether local and remote are identical / local-newer / remote-newer / diverged
- Extend focused web/gateway tests so they expect the new metadata to survive browser export/import and gateway validation.

**Step 2: Run the tests to verify they fail**
- Run: `pnpm --filter @geohelper/protocol test -- --run test/backup.test.ts`
- Run: `pnpm --filter @geohelper/web test -- --run src/storage/backup.test.ts`
- Run: `pnpm --filter @geohelper/gateway test -- test/redis-backup-store.test.ts`
- Expected: FAIL because the current backup envelope only models import/export metadata, not sync metadata.

**Step 3: Write the minimal implementation**
- Extend the shared backup schema and helpers with the smallest metadata set needed for snapshot-level sync.
- Keep checksum semantics stable: checksum still covers the full normalized snapshot body so compare logic can stay deterministic.
- Export one protocol helper that returns a compact sync comparison summary instead of forcing ad-hoc browser/gateway logic.
- Reuse the protocol parser inside gateway backup validation and browser backup creation.

**Step 4: Run the tests to verify they pass**
- Run the same three commands from Step 2.
- Expected: PASS.

**Step 5: Commit**
```bash
git add packages/protocol/src/backup.ts packages/protocol/src/index.ts packages/protocol/test/backup.test.ts apps/web/src/storage/backup.ts apps/web/src/storage/backup.test.ts apps/gateway/src/services/backup-store.ts apps/gateway/test/redis-backup-store.test.ts
git commit -m "feat: extend backup protocol for lightweight sync"
```

---

### Task 2: Add gateway snapshot history and compare endpoints

**Files:**
- Modify: `apps/gateway/src/routes/admin.ts`
- Modify: `apps/gateway/src/services/backup-store.ts`
- Modify: `apps/gateway/src/services/redis-backup-store.ts`
- Modify: `apps/gateway/test/admin-backups.test.ts`
- Modify: `apps/gateway/test/redis-backup-store.test.ts`
- Modify: `apps/gateway/src/services/build-info.ts`

**Step 1: Write the failing tests**
- Extend admin backup route tests to cover:
  - `GET /admin/backups/history`
  - `POST /admin/backups/compare`
- Assert the routes reuse the same `x-admin-token` protection as the existing admin surface.
- Assert compare responses stay compact and metadata-only, for example:
  - `local_status`
  - `remote_status`
  - `comparison_result`
  - `remote_snapshot.summary`
- Extend the Redis backup store test so it proves bounded history is queryable in deterministic order.

**Step 2: Run the tests to verify they fail**
- Run: `pnpm --filter @geohelper/gateway test -- test/admin-backups.test.ts test/redis-backup-store.test.ts`
- Expected: FAIL because the gateway only exposes `latest` read/write today.

**Step 3: Write the minimal implementation**
- Keep the existing `latest` slot intact for backwards compatibility.
- Add one history view backed by the existing bounded history retention in Redis.
- Add one compare route that accepts a browser-provided envelope (or compact local summary) and returns a deterministic comparison result without mutating server state.
- Do not add arbitrary backup catalogs, per-user namespaces, or provider-specific storage logic in this phase.

**Step 4: Run the tests to verify they pass**
- Run the same gateway tests from Step 2.
- Expected: PASS.

**Step 5: Commit**
```bash
git add apps/gateway/src/routes/admin.ts apps/gateway/src/services/backup-store.ts apps/gateway/src/services/redis-backup-store.ts apps/gateway/test/admin-backups.test.ts apps/gateway/test/redis-backup-store.test.ts apps/gateway/src/services/build-info.ts
git commit -m "feat: add gateway backup history and compare routes"
```

---

### Task 3: Add web runtime support for remote snapshot freshness and compare summaries

**Files:**
- Modify: `apps/web/src/runtime/types.ts`
- Modify: `apps/web/src/runtime/gateway-client.ts`
- Modify: `apps/web/src/runtime/gateway-client.test.ts`
- Modify: `apps/web/src/runtime/runtime-service.ts`
- Modify: `apps/web/src/state/settings-store.ts`
- Modify: `apps/web/src/state/settings-store.test.ts`

**Step 1: Write the failing tests**
- Add runtime client tests for:
  - fetching latest remote backup metadata
  - fetching backup history summaries
  - posting a local snapshot to compare against the remote latest snapshot
- Add settings-store tests proving the app can hold a lightweight remote sync state such as:
  - `idle`
  - `checking`
  - `up_to_date`
  - `local_newer`
  - `remote_newer`
  - `diverged`
- Assert gateway-unavailable behavior stays explicit and non-fatal.

**Step 2: Run the tests to verify they fail**
- Run: `pnpm --filter @geohelper/web test -- --run src/runtime/gateway-client.test.ts src/state/settings-store.test.ts`
- Expected: FAIL because the web runtime only knows push/pull metadata today, not remote freshness or compare summaries.

**Step 3: Write the minimal implementation**
- Add typed client helpers for remote backup history and compare.
- Keep the web-side sync state metadata-only; do not fetch full remote envelopes unless the user explicitly chooses restore/import.
- Store the last known compare result in settings/runtime state so UI can render non-blocking sync hints.
- Preserve the current gateway backup actions and messages as the base behavior.

**Step 4: Run the tests to verify they pass**
- Run the same web tests from Step 2.
- Expected: PASS.

**Step 5: Commit**
```bash
git add apps/web/src/runtime/types.ts apps/web/src/runtime/gateway-client.ts apps/web/src/runtime/gateway-client.test.ts apps/web/src/runtime/runtime-service.ts apps/web/src/state/settings-store.ts apps/web/src/state/settings-store.test.ts
git commit -m "feat: add remote backup sync state"
```

---

### Task 4: Surface lightweight cloud sync status and compare actions in settings UX

**Files:**
- Modify: `apps/web/src/components/settings-remote-backup.ts`
- Modify: `apps/web/src/components/settings-remote-backup.test.ts`
- Modify: `apps/web/src/components/SettingsDrawer.tsx`
- Modify: `apps/web/src/state/chat-store.ts`
- Modify: `apps/web/src/storage/backup.ts`
- Modify: `tests/e2e/chat-to-render.spec.ts`

**Step 1: Write the failing tests**
- Add focused helper/UI tests proving the settings drawer can show:
  - last remote snapshot summary
  - compare status (`已同步` / `本地较新` / `云端较新` / `存在分叉`)
  - explicit actions: `检查云端状态`, `上传最新快照`, `拉取后导入（合并）`, `拉取后覆盖导入`
- Add one Playwright slice or focused component assertion proving cloud-sync status remains informative even when the gateway is unavailable.
- Assert the UI never auto-imports or silently overwrites local history.

**Step 2: Run the tests to verify they fail**
- Run: `pnpm --filter @geohelper/web test -- --run src/components/settings-remote-backup.test.ts`
- Run: `pnpm exec playwright test tests/e2e/chat-to-render.spec.ts --grep "backup|sync|restore"`
- Expected: FAIL because the current UI only supports explicit push/pull/restore without compare-driven sync status.

**Step 3: Write the minimal implementation**
- Reuse the current remote-backup settings section instead of creating a new navigation area.
- Show compare summaries as a lightweight status card above the existing actions.
- Keep restore/import as an explicit second step after the user inspects remote freshness.
- Keep cloud sync language honest: this is snapshot sync/recovery, not message-by-message live sync.

**Step 4: Run the tests to verify they pass**
- Run the same commands from Step 2.
- Expected: PASS.

**Step 5: Commit**
```bash
git add apps/web/src/components/settings-remote-backup.ts apps/web/src/components/settings-remote-backup.test.ts apps/web/src/components/SettingsDrawer.tsx apps/web/src/state/chat-store.ts apps/web/src/storage/backup.ts tests/e2e/chat-to-render.spec.ts
git commit -m "feat: surface lightweight cloud sync status"
```

---

### Task 5: Add conservative startup freshness checks and delayed auto-upload

**Files:**
- Create: `apps/web/src/storage/remote-sync.ts`
- Create: `apps/web/src/storage/remote-sync.test.ts`
- Modify: `apps/web/src/state/settings-store.ts`
- Modify: `apps/web/src/state/settings-store.test.ts`
- Modify: `apps/web/src/state/chat-store.ts`
- Modify: `apps/web/src/state/scene-store.ts`
- Modify: `apps/web/src/state/template-store.ts`
- Modify: `apps/web/src/components/SettingsDrawer.tsx`

**Step 1: Write the failing tests**
- Add unit tests for a small remote-sync scheduler that supports modes such as:
  - `off`
  - `remind_only`
  - `delayed_upload`
- Assert startup behavior does only one metadata probe when the user has:
  - a usable gateway profile
  - a saved admin token
  - lightweight cloud sync enabled
- Assert delayed upload is debounced and disabled while a restore/import is in progress.

**Step 2: Run the tests to verify they fail**
- Run: `pnpm --filter @geohelper/web test -- --run src/storage/remote-sync.test.ts src/state/settings-store.test.ts`
- Expected: FAIL because no remote sync scheduler or preference model exists.

**Step 3: Write the minimal implementation**
- Add one small scheduler/helper instead of scattering timers across multiple stores.
- Trigger delayed upload from existing snapshot persistence touchpoints, but only upload full backup envelopes after a quiet period.
- Never background-pull or background-merge.
- Keep the default mode conservative (`off` or `remind_only`) so current behavior stays safe for existing users.

**Step 4: Run the tests to verify they pass**
- Run the same commands from Step 2.
- Expected: PASS.

**Step 5: Commit**
```bash
git add apps/web/src/storage/remote-sync.ts apps/web/src/storage/remote-sync.test.ts apps/web/src/state/settings-store.ts apps/web/src/state/settings-store.test.ts apps/web/src/state/chat-store.ts apps/web/src/state/scene-store.ts apps/web/src/state/template-store.ts apps/web/src/components/SettingsDrawer.tsx
git commit -m "feat: add delayed lightweight cloud sync"
```

---

### Task 6: Refresh release gates, docs, and smoke coverage for lightweight cloud sync

**Files:**
- Modify: `README.md`
- Modify: `docs/BETA_CHECKLIST.md`
- Modify: `docs/deploy/edgeone.md`
- Modify: `docs/user/settings-backup-recovery.md`
- Modify: `tests/workspace/gateway-backup-restore.test.ts`
- Modify: `tests/workspace/beta-checklist.test.ts`
- Modify: `tests/workspace/deploy-docs.test.ts`
- Create: `tests/workspace/remote-sync-docs.test.ts`

**Step 1: Write the failing tests**
- Extend workspace doc tests so release/docs now mention:
  - lightweight cloud sync remains snapshot-based
  - no SQL or full cloud history is required
  - startup freshness checks are metadata-only
  - delayed upload is opt-in and never auto-restores
- Add one workspace docs test for the new user-facing sync terminology so the docs do not drift back toward “full cloud chat sync” language.

**Step 2: Run the tests to verify they fail**
- Run: `pnpm exec vitest run tests/workspace/gateway-backup-restore.test.ts tests/workspace/beta-checklist.test.ts tests/workspace/deploy-docs.test.ts tests/workspace/remote-sync-docs.test.ts`
- Expected: FAIL because the docs and release gates still describe only manual remote backup/recovery.

**Step 3: Write the minimal implementation**
- Update docs to explain the new lightweight cloud sync contract precisely.
- Keep the release language conservative: compare/freshness probes help recovery, but they do not imply real-time sync.
- Clarify deployment knobs for operators who want delayed auto-upload enabled.

**Step 4: Run the tests to verify they pass**
- Run the same workspace test command from Step 2.
- Expected: PASS.

**Step 5: Commit**
```bash
git add README.md docs/BETA_CHECKLIST.md docs/deploy/edgeone.md docs/user/settings-backup-recovery.md tests/workspace/gateway-backup-restore.test.ts tests/workspace/beta-checklist.test.ts tests/workspace/deploy-docs.test.ts tests/workspace/remote-sync-docs.test.ts
git commit -m "docs: add lightweight cloud sync release guidance"
```

---

### Task 7: Final verification and V7-A release gate refresh

**Files:**
- Modify: `docs/plans/2026-03-12-backend-v7a-lightweight-cloud-sync-roadmap.md`

**Step 1: Run protocol, gateway, web, and workspace verification**
- Run: `pnpm --filter @geohelper/protocol test`
- Run: `pnpm --filter @geohelper/gateway test`
- Run: `pnpm --filter @geohelper/web test -- --run src/storage/backup.test.ts src/storage/remote-sync.test.ts src/runtime/gateway-client.test.ts src/state/settings-store.test.ts src/components/settings-remote-backup.test.ts`
- Run: `pnpm exec vitest run tests/workspace/gateway-backup-restore.test.ts tests/workspace/gateway-ops-runner.test.ts tests/workspace/gateway-ops-scheduled.test.ts tests/workspace/beta-checklist.test.ts tests/workspace/deploy-docs.test.ts tests/workspace/remote-sync-docs.test.ts`
- Run: `pnpm typecheck`

**Step 2: Run focused smoke / browser verification**
- Run: `pnpm smoke:gateway-backup-restore -- --dry-run`
- Run: `pnpm ops:gateway:scheduled -- --dry-run`
- Run: `pnpm exec playwright test tests/e2e/chat-to-render.spec.ts --grep "backup|sync|restore"`
- Expected: PASS, or document any pre-existing unrelated failures explicitly before release claims.

**Step 3: Refresh plan status notes**
- Update this roadmap with a short completion note or status marker once implementation lands.
- Keep deferred follow-ups separate from the completed scope.

**Step 4: Commit merged release-gate refresh**
```bash
git add docs/plans/2026-03-12-backend-v7a-lightweight-cloud-sync-roadmap.md
git commit -m "docs: refresh backend v7a lightweight sync roadmap"
```

**Step 5: Merge / handoff**
- Merge the completed branch back into `main` only after the verification commands above are fresh and green.
- Clean up temporary worktrees after merge.

---

## Deferred Follow-Ups (Do Not Start In This Plan)

- SQL-backed conversation/message storage.
- True cloud history sync with server-authoritative conversations.
- Multi-device real-time conflict resolution.
- Multi-tenant user/workspace isolation.
- Attachment/media object storage and remote asset catalogs.
- Background pull with automatic merge.

## Delivery Notes

- Treat this roadmap as `Route 1`: cloud sync is still backup-centric and local-first.
- Prefer metadata probes over full remote snapshot downloads during normal app startup.
- The browser remains the live editing authority; the gateway stores validated recovery snapshots plus bounded comparison history.
