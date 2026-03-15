# Backend V7-M Rollback Anchor Overwrite Guard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Finish `V7-M` by warning before any manual import replaces the current single-slot rollback anchor, and require an explicit confirmation instead of silently discarding the previous undo point.

**Architecture:** Keep the work narrowly scoped to the browser-local Route 1 import flow. Reuse the existing rollback-anchor capture/restore pipeline and the current replace-danger armed-confirmation pattern, but generalize the presentation helper so it can express both `replace danger` and `rollback-anchor overwrite` risk for local-file imports and pulled-remote imports. Do not touch `apps/gateway` behavior or storage contracts.

**Tech Stack:** React 19, TypeScript, Vitest, Playwright, browser localStorage rollback anchor helpers

---

### Task 1: Replace the replace-only helper with a generic import guard resolver

**Files:**
- Modify: `apps/web/src/components/settings-remote-backup.ts`
- Modify: `apps/web/src/components/settings-remote-backup.test.ts`

**Step 1: Write the failing test**

In `apps/web/src/components/settings-remote-backup.test.ts`, add a new helper test block for a new pure resolver such as `resolveImportActionGuardPresentation(...)`.

Cover these cases explicitly:

1. local merge without rollback anchor
2. local merge with rollback anchor
3. local replace without rollback anchor
4. local replace with rollback anchor
5. pulled-remote merge without rollback anchor
6. pulled-remote merge with rollback anchor
7. pulled-remote replace without rollback anchor
8. pulled-remote replace with rollback anchor

Suggested assertions:

```ts
expect(
  resolveImportActionGuardPresentation({
    scope: "local",
    mode: "merge",
    armed: false,
    hasRollbackAnchor: false,
    anchorSourceLabel: null
  })
).toEqual({
  buttonLabel: "合并导入（推荐）",
  warning: null,
  shouldArmFirst: false,
  danger: false
});

expect(
  resolveImportActionGuardPresentation({
    scope: "local",
    mode: "merge",
    armed: false,
    hasRollbackAnchor: true,
    anchorSourceLabel: "本地备份文件（lesson-a.json）"
  })
).toEqual({
  buttonLabel: "合并导入（推荐）",
  warning:
    "继续导入会替换当前恢复锚点（来源：本地备份文件（lesson-a.json））。请再次点击确认后继续。",
  shouldArmFirst: true,
  danger: false
});

expect(
  resolveImportActionGuardPresentation({
    scope: "remote_pulled",
    mode: "replace",
    armed: true,
    hasRollbackAnchor: true,
    anchorSourceLabel: "云端最新快照（snap-1）"
  })
).toEqual({
  buttonLabel: "确认拉取后覆盖导入",
  warning:
    "高风险操作：拉取后覆盖导入会直接替换当前本地数据，并替换当前恢复锚点（来源：云端最新快照（snap-1））。请再次点击“确认拉取后覆盖导入”继续。",
  shouldArmFirst: false,
  danger: true
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @geohelper/web test -- --run src/components/settings-remote-backup.test.ts`

Expected: FAIL because the current exported helper only models replace-danger and cannot express merge-time rollback-anchor overwrite warnings.

**Step 3: Write minimal implementation**

In `apps/web/src/components/settings-remote-backup.ts`:

1. Add a new presentation type:

```ts
export interface ImportActionGuardPresentation {
  buttonLabel: string;
  warning: string | null;
  shouldArmFirst: boolean;
  danger: boolean;
}
```

2. Add a pure resolver:

```ts
export const resolveImportActionGuardPresentation = (params: {
  scope: "local" | "remote_pulled";
  mode: "merge" | "replace";
  armed: boolean;
  hasRollbackAnchor: boolean;
  anchorSourceLabel: string | null;
}): ImportActionGuardPresentation => { ... }
```

3. Keep the logic DRY:
- `replace` without rollback anchor should preserve the existing `V7-J` behavior exactly.
- `merge` with rollback anchor should warn and require a single explicit confirm cycle.
- `replace` with rollback anchor should combine both risks into one warning and keep only one confirm cycle total.
- `anchorSourceLabel` should be optional so callers can pass `null` before the card is fully rendered.

4. If it keeps the diff smaller, leave `resolveReplaceImportConfirmationPresentation(...)` as a thin wrapper around the new resolver for temporary compatibility, but prefer switching callers and tests to the new helper so the old helper can be removed cleanly.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @geohelper/web test -- --run src/components/settings-remote-backup.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/components/settings-remote-backup.ts apps/web/src/components/settings-remote-backup.test.ts
git commit -m "feat: add rollback-anchor import guard helper"
```

### Task 2: Add rollback-anchor overwrite guard to local-file import

**Files:**
- Modify: `apps/web/src/components/SettingsDrawer.tsx`
- Modify: `tests/e2e/settings-drawer.spec.ts`

**Step 1: Write the failing test**

In `tests/e2e/settings-drawer.spec.ts`, add:

```ts
test("warns before replacing an existing rollback anchor on local import", async ({
  page
}) => {
  // 1. seed local snapshot
  // 2. import one backup successfully so a rollback anchor exists
  // 3. select a second backup file
  // 4. assert merge import does not run immediately
  // 5. assert preview warns that the current rollback anchor will be replaced
  // 6. assert one extra confirm cycle is required for merge
  // 7. assert replace still uses one confirm cycle total, not two
});
```

Concrete checks to include:
- after the first click on `合并导入（推荐）`, local storage is unchanged
- warning text mentions that the current rollback anchor will be replaced
- the second click is the one that actually starts import
- `覆盖导入` still becomes `确认覆盖本地数据`, not a second extra label on top of that

**Step 2: Run test to verify it fails**

Run: `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "warns before replacing an existing rollback anchor on local import"`

Expected: FAIL because local merge import currently executes immediately even when a rollback anchor already exists.

**Step 3: Write minimal implementation**

In `apps/web/src/components/SettingsDrawer.tsx`:

1. Add a new state:

```ts
const [localMergeImportArmed, setLocalMergeImportArmed] = useState(false);
```

2. Compute local button presentation from the new helper:
- merge button: `mode: "merge"`, `armed: localMergeImportArmed`
- replace button: `mode: "replace"`, `armed: localReplaceImportArmed`
- `hasRollbackAnchor: Boolean(importRollbackAnchor)`
- `anchorSourceLabel: importRollbackAnchorPresentation?.sourceLabel ?? null`

3. Change the merge button click handler:
- if the helper says `shouldArmFirst`, set `localMergeImportArmed(true)` and return
- otherwise clear both local armed states and call `handleImportBackup("merge")`

4. Keep replace import on a single confirm cycle:
- first click arms only `localReplaceImportArmed`
- second click executes replace
- if a rollback anchor exists, its warning text must be combined into the same armed replace state rather than creating a second confirmation stage

5. Reset both local armed states when:
- `pendingBackupFile` changes
- `backupInspection` changes
- the local preview is cancelled
- import succeeds or fails
- rollback anchor is restored or cleared

**Step 4: Run test to verify it passes**

Run: `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "warns before replacing an existing rollback anchor on local import"`

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/components/SettingsDrawer.tsx tests/e2e/settings-drawer.spec.ts
git commit -m "feat: guard local imports from replacing rollback anchor silently"
```

### Task 3: Add rollback-anchor overwrite guard to pulled-remote import

**Files:**
- Modify: `apps/web/src/components/SettingsDrawer.tsx`
- Modify: `tests/e2e/settings-drawer.spec.ts`

**Step 1: Write the failing test**

In `tests/e2e/settings-drawer.spec.ts`, add:

```ts
test("warns before replacing an existing rollback anchor on pulled remote import", async ({
  page
}) => {
  // 1. seed local snapshot and remote backup settings
  // 2. create one rollback anchor through a first manual import
  // 3. pull a remote backup preview
  // 4. assert merge import does not execute on first click
  // 5. assert preview warns that current rollback anchor will be replaced
  // 6. assert replace import still uses one confirmation cycle total
});
```

Concrete checks to include:
- `拉取后导入（合并）` requires an explicit second click only when a rollback anchor already exists
- `拉取后覆盖导入` still becomes `确认拉取后覆盖导入`
- stale-preview disabling still wins over any guard state
- clearing the pulled preview resets any armed merge state

**Step 2: Run test to verify it fails**

Run: `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "warns before replacing an existing rollback anchor on pulled remote import"`

Expected: FAIL because pulled merge import currently executes immediately and only replace import has an armed state.

**Step 3: Write minimal implementation**

In `apps/web/src/components/SettingsDrawer.tsx`:

1. Add a new state:

```ts
const [remoteMergeImportArmed, setRemoteMergeImportArmed] = useState(false);
```

2. Reuse the same helper for pulled-preview buttons:
- merge button: `mode: "merge"`, `armed: remoteMergeImportArmed`
- replace button: `mode: "replace"`, `armed: remoteReplaceImportArmed`
- `hasRollbackAnchor: Boolean(importRollbackAnchor)`
- `anchorSourceLabel: importRollbackAnchorPresentation?.sourceLabel ?? null`

3. Keep existing stale-preview protection intact:
- if `remoteBackupPulledPreviewGuardPresentation?.importEnabled` is false, both buttons remain disabled
- do not arm a merge action while the preview is stale or disabled

4. Reset both remote armed states when:
- pulled preview changes
- pulled preview is cleared
- import succeeds or fails
- rollback anchor is restored or cleared

**Step 4: Run test to verify it passes**

Run: `pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "warns before replacing an existing rollback anchor on pulled remote import"`

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/components/SettingsDrawer.tsx tests/e2e/settings-drawer.spec.ts
git commit -m "feat: guard pulled imports from replacing rollback anchor silently"
```

### Task 4: Mark V7-M complete and run focused verification

**Files:**
- Modify: `docs/plans/README.md`
- Modify: `docs/plans/2026-03-14-backend-v7m-rollback-anchor-overwrite-guard-roadmap.md`

**Step 1: Update roadmap docs**

In `docs/plans/README.md`:
- change `V7-M` from `Proposed / current latest roadmap` to `Completed / historical context`
- if there is a newer follow-on roadmap by then, update the “current latest roadmap” note accordingly

In `docs/plans/2026-03-14-backend-v7m-rollback-anchor-overwrite-guard-roadmap.md`:
- add a short execution-status note at the top with date and verification summary

**Step 2: Run focused verification**

Run:

```bash
pnpm --filter @geohelper/web test -- --run src/components/settings-remote-backup.test.ts
pnpm exec playwright test tests/e2e/settings-drawer.spec.ts --grep "warns before replacing an existing rollback anchor on local import|warns before replacing an existing rollback anchor on pulled remote import|shows import outcome summary after local import and restores the pre-import local snapshot|shows import outcome summary after remote import with the latest snapshot source label|clears rollback anchor without mutating the imported local snapshot|warns when rollback would discard newer post-import changes"
pnpm typecheck
```

Expected: PASS.

**Step 3: Commit**

```bash
git add docs/plans/README.md docs/plans/2026-03-14-backend-v7m-rollback-anchor-overwrite-guard-roadmap.md
git commit -m "docs: mark backend v7m rollback guard complete"
```

### Task 5: Optional broader confidence pass before merge

**Files:**
- Verify only: `apps/web/**`
- Verify only: `tests/e2e/settings-drawer.spec.ts`

**Step 1: Run broader verification**

Run:

```bash
pnpm --filter @geohelper/web test
pnpm exec playwright test tests/e2e/settings-drawer.spec.ts
```

Expected: PASS.

**Step 2: Merge readiness check**

Confirm that:
- merge import now never silently replaces an existing rollback anchor
- replace import still uses one and only one confirm cycle
- local-file and pulled-remote flows behave consistently
- stale-preview disabling still blocks pulled import
- rollback restore/clear still work after the new guard states were introduced

