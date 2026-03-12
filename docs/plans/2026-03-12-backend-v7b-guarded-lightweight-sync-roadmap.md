# Backend V7-B Guarded Lightweight Sync Roadmap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Harden Route 1 lightweight cloud sync so delayed upload and normal web-side uploads cannot silently overwrite a newer or diverged remote snapshot.

**Architecture:** Keep the system local-first and snapshot-based. Introduce one guarded gateway write path with explicit remote preconditions, teach the web runtime to treat conflicts as first-class sync states, and require an explicit operator override before any web UI force-overwrites the remote snapshot. Preserve the existing unconditional latest-backup route for operator/manual tooling compatibility, but move browser sync flows onto the guarded contract by default.

**Tech Stack:** `@geohelper/protocol`, Fastify admin routes, Redis-compatible KV, React + Zustand, existing backup/restore helpers, existing remote sync controller, Vitest workspace tests, Playwright settings coverage.

**Status (2026-03-12):** Completed. Browser sync now defaults to guarded writes, delayed upload no longer silently overwrites newer/diverged remote snapshots, settings UX requires an explicit danger action before force overwrite, and docs/release gates have been refreshed. Fresh verification completed with:

- `pnpm --filter @geohelper/protocol test`
- `pnpm --filter @geohelper/gateway test`
- `pnpm --filter @geohelper/web test -- --run src/storage/backup.test.ts src/storage/remote-sync.test.ts src/runtime/gateway-client.test.ts src/state/settings-store.test.ts src/components/settings-remote-backup.test.ts`
- `pnpm exec vitest run tests/workspace/gateway-backup-restore.test.ts tests/workspace/gateway-ops-runner.test.ts tests/workspace/gateway-ops-scheduled.test.ts tests/workspace/beta-checklist.test.ts tests/workspace/deploy-docs.test.ts tests/workspace/remote-sync-docs.test.ts`
- `pnpm typecheck`
- `pnpm smoke:gateway-backup-restore -- --dry-run`
- `pnpm ops:gateway:scheduled -- --dry-run`
- `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "remote backup sync|force overwrite"`

---

## Phase Map

- `P0`: Add guarded gateway write primitives and conflict responses.
- `P1`: Move browser sync flows to guarded upload semantics and blocked sync states.
- `P2`: Surface explicit conflict-resolution UX and force-override safety rails.
- `P3`: Refresh docs, release gates, and smoke coverage around overwrite protection.
- Out of scope: SQL/OLTP storage, message-level cloud history, user accounts, multi-tenant workspaces, automatic background pull/merge, real-time collaboration, attachment/media object storage.

---

### Task 1: Add guarded gateway backup write contract

**Files:**
- Modify: `apps/gateway/src/services/backup-store.ts`
- Modify: `apps/gateway/src/services/redis-backup-store.ts`
- Modify: `apps/gateway/src/routes/admin.ts`
- Modify: `apps/gateway/test/redis-backup-store.test.ts`
- Modify: `apps/gateway/test/admin-backups.test.ts`

**Step 1: Write the failing tests**
- Extend gateway store tests so a write can be attempted with remote preconditions such as:
  - `expected_remote_snapshot_id`
  - optional `expected_remote_checksum`
- Assert guarded writes:
  - succeed when remote is missing and caller expects missing
  - succeed when the expected remote snapshot still matches
  - return a conflict result when the remote snapshot changed
  - keep the existing latest/history state unchanged on conflict
- Extend admin backup route tests to cover one new guarded write endpoint, for example `POST /admin/backups/guarded`, that:
  - reuses the existing `x-admin-token` gate
  - returns `200` with the new latest summary when the guarded write succeeds
  - returns `409` with compact conflict metadata when the precondition fails

**Step 2: Run the tests to verify they fail**
- Run: `pnpm --filter @geohelper/gateway test -- test/admin-backups.test.ts test/redis-backup-store.test.ts`
- Expected: FAIL because the gateway only supports unconditional latest-backup writes today.

**Step 3: Write the minimal implementation**
- Add one guarded write result union in the backup store layer, for example:
  - `written`
  - `conflict`
- Keep `writeLatest()` intact for backward compatibility and operator scripts.
- Add one guarded route that accepts:
  - `envelope`
  - `expected_remote_snapshot_id`
  - optional `expected_remote_checksum`
- Return only compact conflict metadata:
  - `comparison_result`
  - `expected_remote_snapshot_id`
  - `actual_remote_snapshot.summary`
  - build identity
- Do not add arbitrary history restore mutations or per-device namespaces in this phase.

**Step 4: Run the tests to verify they pass**
- Run the same gateway tests from Step 2.
- Expected: PASS.

**Step 5: Commit**
```bash
git add apps/gateway/src/services/backup-store.ts apps/gateway/src/services/redis-backup-store.ts apps/gateway/src/routes/admin.ts apps/gateway/test/redis-backup-store.test.ts apps/gateway/test/admin-backups.test.ts
git commit -m "feat: add guarded gateway backup writes"
```

---

### Task 2: Add web runtime support for guarded upload results

**Files:**
- Modify: `apps/web/src/runtime/types.ts`
- Modify: `apps/web/src/runtime/gateway-client.ts`
- Modify: `apps/web/src/runtime/gateway-client.test.ts`
- Modify: `apps/web/src/state/settings-store.ts`
- Modify: `apps/web/src/state/settings-store.test.ts`

**Step 1: Write the failing tests**
- Extend runtime client tests so the web runtime can:
  - call the guarded gateway upload route
  - parse success and conflict responses distinctly
  - preserve compact remote summary metadata from a `409` conflict
- Extend settings-store tests so remote sync state can now represent:
  - `uploading`
  - `upload_blocked_remote_newer`
  - `upload_blocked_diverged`
  - `upload_conflict`
  - `force_upload_required`
- Assert conflict state remains non-destructive and keeps the last remote summary visible.

**Step 2: Run the tests to verify they fail**
- Run: `pnpm --filter @geohelper/web test -- --run src/runtime/gateway-client.test.ts src/state/settings-store.test.ts`
- Expected: FAIL because the web runtime only models unconditional upload success today.

**Step 3: Write the minimal implementation**
- Add one typed guarded upload helper in the gateway client.
- Normalize guarded upload responses into an explicit union instead of throwing away conflict metadata.
- Extend settings-store state so UI and the remote sync controller can distinguish:
  - safe success
  - remote-changed conflict
  - explicit force-required follow-up
- Keep existing pull/compare state shape intact where possible.

**Step 4: Run the tests to verify they pass**
- Run the same web tests from Step 2.
- Expected: PASS.

**Step 5: Commit**
```bash
git add apps/web/src/runtime/types.ts apps/web/src/runtime/gateway-client.ts apps/web/src/runtime/gateway-client.test.ts apps/web/src/state/settings-store.ts apps/web/src/state/settings-store.test.ts
git commit -m "feat: add guarded remote backup client state"
```

---

### Task 3: Prevent delayed upload from overwriting newer remote snapshots

**Files:**
- Modify: `apps/web/src/storage/remote-sync.ts`
- Modify: `apps/web/src/storage/remote-sync.test.ts`
- Modify: `apps/web/src/state/chat-store.ts`
- Modify: `apps/web/src/state/scene-store.ts`
- Modify: `apps/web/src/state/template-store.ts`

**Step 1: Write the failing tests**
- Extend remote-sync controller tests so delayed upload now:
  - performs a compare/guarded-upload sequence instead of unconditional upload
  - writes successfully only when the last known remote snapshot still matches expectations
  - records a blocked sync result when the remote snapshot became newer or diverged
  - suppresses repeated retry loops while the conflict remains unresolved
- Add one regression proving import/restore still cancels pending delayed uploads and does not mislabel the resulting sync state.

**Step 2: Run the tests to verify they fail**
- Run: `pnpm --filter @geohelper/web test -- --run src/storage/remote-sync.test.ts`
- Expected: FAIL because `runDelayedUpload()` currently writes latest directly with no remote precondition.

**Step 3: Write the minimal implementation**
- Make delayed upload use the new guarded upload helper by default.
- Base the guarded write precondition on the last known remote summary stored in sync state.
- When guarded upload conflicts:
  - do not overwrite remote state
  - persist the returned latest remote summary
  - mark local sync as blocked until the user explicitly resolves it
- Keep startup freshness checks metadata-only.

**Step 4: Run the tests to verify they pass**
- Run the same remote-sync test command from Step 2.
- Expected: PASS.

**Step 5: Commit**
```bash
git add apps/web/src/storage/remote-sync.ts apps/web/src/storage/remote-sync.test.ts apps/web/src/state/chat-store.ts apps/web/src/state/scene-store.ts apps/web/src/state/template-store.ts
git commit -m "feat: guard delayed remote sync uploads"
```

---

### Task 4: Add explicit conflict-resolution UX in settings

**Files:**
- Modify: `apps/web/src/components/settings-remote-backup.ts`
- Modify: `apps/web/src/components/settings-remote-backup.test.ts`
- Modify: `apps/web/src/components/SettingsDrawer.tsx`
- Modify: `tests/e2e/settings-drawer.spec.ts`

**Step 1: Write the failing tests**
- Extend helper/component tests so the settings drawer can show:
  - remote-changed warnings for `云端较新` and `存在分叉`
  - a blocked delayed-upload state with actionable copy
  - a force-override affordance that is hidden until conflict exists
- Add Playwright coverage for one full conflict loop:
  - compare shows remote changed
  - default `上传最新快照` does not overwrite
  - user sees remote summary and explicit warning
  - optional danger action is required before force overwrite
- Assert the default web upload path is guarded and never silently overwrites a newer remote snapshot.

**Step 2: Run the tests to verify they fail**
- Run: `pnpm --filter @geohelper/web test -- --run src/components/settings-remote-backup.test.ts`
- Run: `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "remote backup sync|force overwrite"`
- Expected: FAIL because the current settings flow has no blocked/conflict-specific upload UX.

**Step 3: Write the minimal implementation**
- Keep the existing remote-backup section and status card.
- Make `上传最新快照` use guarded upload semantics by default.
- Show one explicit secondary danger action only after a conflict response, for example `仍然覆盖云端快照`.
- Keep pull/import as a safe alternative path beside overwrite.
- Do not add background merge, auto-pull, or hidden conflict resolution.

**Step 4: Run the tests to verify they pass**
- Run the same commands from Step 2.
- Expected: PASS.

**Step 5: Commit**
```bash
git add apps/web/src/components/settings-remote-backup.ts apps/web/src/components/settings-remote-backup.test.ts apps/web/src/components/SettingsDrawer.tsx tests/e2e/settings-drawer.spec.ts
git commit -m "feat: add guarded sync conflict resolution UX"
```

---

### Task 5: Refresh docs, release gates, and smoke coverage for overwrite protection

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
- Extend workspace doc tests so release/docs now mention:
  - delayed upload never overwrites a newer remote snapshot silently
  - guarded upload is the default browser path
  - force overwrite requires an explicit danger action
  - Route 1 still stays snapshot-based and does not require SQL/full cloud history
- Add one docs test to prevent drift back toward language implying hidden background merge or automatic remote overwrite.

**Step 2: Run the tests to verify they fail**
- Run: `pnpm exec vitest run tests/workspace/gateway-backup-restore.test.ts tests/workspace/beta-checklist.test.ts tests/workspace/deploy-docs.test.ts tests/workspace/remote-sync-docs.test.ts`
- Expected: FAIL because the docs currently describe lightweight sync but not guarded overwrite protection.

**Step 3: Write the minimal implementation**
- Update docs to explain the guarded sync contract precisely.
- Keep operator tooling docs honest:
  - gateway retains unconditional admin latest write for manual/operator use
  - browser sync defaults to guarded writes
  - explicit overwrite remains available only after warning
- Preserve Route 1 language: local-first, snapshot-based, no SQL/full cloud history backend.

**Step 4: Run the tests to verify they pass**
- Run the same workspace test command from Step 2.
- Expected: PASS.

**Step 5: Commit**
```bash
git add README.md docs/BETA_CHECKLIST.md docs/deploy/edgeone.md docs/user/settings-backup-recovery.md tests/workspace/gateway-backup-restore.test.ts tests/workspace/beta-checklist.test.ts tests/workspace/deploy-docs.test.ts tests/workspace/remote-sync-docs.test.ts
git commit -m "docs: add guarded lightweight sync guidance"
```

---

### Task 6: Final verification and V7-B release gate refresh

**Files:**
- Modify: `docs/plans/2026-03-12-backend-v7b-guarded-lightweight-sync-roadmap.md`

**Step 1: Run protocol, gateway, web, and workspace verification**
- Run: `pnpm --filter @geohelper/protocol test`
- Run: `pnpm --filter @geohelper/gateway test`
- Run: `pnpm --filter @geohelper/web test -- --run src/storage/backup.test.ts src/storage/remote-sync.test.ts src/runtime/gateway-client.test.ts src/state/settings-store.test.ts src/components/settings-remote-backup.test.ts`
- Run: `pnpm exec vitest run tests/workspace/gateway-backup-restore.test.ts tests/workspace/gateway-ops-runner.test.ts tests/workspace/gateway-ops-scheduled.test.ts tests/workspace/beta-checklist.test.ts tests/workspace/deploy-docs.test.ts tests/workspace/remote-sync-docs.test.ts`
- Run: `pnpm typecheck`

**Step 2: Run focused smoke / browser verification**
- Run: `pnpm smoke:gateway-backup-restore -- --dry-run`
- Run: `pnpm ops:gateway:scheduled -- --dry-run`
- Run: `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "remote backup sync|force overwrite"`
- Expected: PASS, or document any pre-existing unrelated failures explicitly before release claims.

**Step 3: Refresh plan status notes**
- Update this roadmap with a short completion note or status marker once implementation lands.
- Keep deferred follow-ups separate from the completed scope.

**Step 4: Commit merged release-gate refresh**
```bash
git add docs/plans/2026-03-12-backend-v7b-guarded-lightweight-sync-roadmap.md
git commit -m "docs: refresh backend v7b guarded sync roadmap"
```

**Step 5: Merge / handoff**
- Merge the completed branch back into `main` only after the verification commands above are fresh and green.
- Clean up temporary worktrees after merge.

---

## Deferred Follow-Ups (Do Not Start In This Plan)

- SQL-backed conversation/message storage.
- True server-authoritative cloud history.
- Automatic background pull and merge.
- Multi-device live conflict resolution.
- Multi-tenant user/workspace isolation.
- Attachment/media object sync.

## Delivery Notes

- Treat this roadmap as the next Route 1 step: make lightweight cloud sync safer before making it broader.
- The browser remains the live editing authority.
- Gateway latest-backup storage remains single-tenant and snapshot-based.
- A blocked guarded upload is a success condition for safety, not a failure to hide.
