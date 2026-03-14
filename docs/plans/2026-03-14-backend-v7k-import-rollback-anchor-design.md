# Backend V7-K Import Rollback Anchor Design

**Status:** Proposed  
**Date:** 2026-03-14  
**Scope:** Route 1 local-first recovery safety

## Goal

Add one local rollback anchor before any manual import writes into browser storage, so a user can recover the pre-import local state from the settings drawer with one explicit action after a merge or replace import goes wrong.

## Why this is the next Route 1 step

`V7-A` through `V7-J` made remote snapshot recovery increasingly safer to inspect and import, but the browser still has one sharp edge: once a user confirms an import, especially a replace import, the old local state is gone unless they exported a backup manually beforehand.

For Route 1, the safest next improvement is still local-first:

- no SQL
- no background cloud history sync
- no server-authoritative rollback state
- no modal-heavy workflow

Instead, we capture one explicit pre-import local snapshot in the browser right before the import runs, persist it across the post-import reload, and expose a small “restore pre-import state” affordance in the existing `设置 -> 数据与安全 -> 备份与恢复` area.

## Chosen shape

### Single-slot local rollback anchor

We store exactly one rollback anchor in browser storage.

That anchor contains:

- `capturedAt`
- `source`
  - `local_file`
  - `remote_latest`
  - `remote_selected_history`
- `importMode`
  - `merge`
  - `replace`
- optional source details
  - local filename
  - remote snapshot id
- full `BackupEnvelope` of the local state captured immediately before import

This remains intentionally small and opinionated:

- the newest import replaces the previous anchor
- there is no multi-level history browser
- there is no remote persistence

That keeps the feature understandable and avoids quietly turning Route 1 into a generic local versioning system.

## UX behavior

### Before import

When the user clicks any import action that mutates local browser state, GeoHelper first captures the current app snapshot as a rollback anchor, then performs the existing import.

Covered entry points:

1. local file import -> `合并导入（推荐）`
2. local file import -> `覆盖导入`
3. pulled remote preview -> `拉取后导入（合并）`
4. pulled remote preview -> `拉取后覆盖导入`

### After import

Because the app already reloads after successful import, the rollback anchor must survive reload. On the next settings open, the user sees:

- rollback anchor capture time
- source label
- import mode label
- captured snapshot summary
  - local snapshot id
  - conversation count

And two actions:

1. `恢复到导入前状态`
2. `清除此恢复锚点`

### Restore behavior

`恢复到导入前状态` performs a local replace restore using the captured envelope, then reloads the app.

This action is intentionally one click in `V7-K`. The rationale is that this button is itself the escape hatch for a mistaken import, and adding another confirmation layer would make recovery slower right when the user is trying to undo damage.

After a successful restore:

- clear the rollback anchor
- show a success message
- reload the app

If restore fails:

- keep the anchor
- show an explicit failure message

## Data model and storage

Add a new local-only record in `apps/web/src/storage/backup.ts`.

Suggested shape:

```ts
interface ImportRollbackAnchor {
  capturedAt: string;
  source: "local_file" | "remote_latest" | "remote_selected_history";
  importMode: "merge" | "replace";
  sourceLabel: string | null;
  envelope: BackupEnvelope;
}
```

Persist it under a dedicated storage key such as:

```ts
const IMPORT_ROLLBACK_ANCHOR_KEY = "geohelper.backup.import_rollback_anchor";
```

The storage module should own:

- capture
- read
- clear
- restore

This keeps the settings layer thin and avoids duplicating snapshot serialization logic in the UI.

## Presentation layer

Add one small helper in `apps/web/src/components/settings-remote-backup.ts` to format the rollback anchor card consistently:

- source label
- import mode label
- compact summary string
- warning / hint copy

That keeps `SettingsDrawer.tsx` aligned with the existing pattern already used for:

- pulled preview guidance
- stale preview guards
- impact counts
- replace confirmation copy

## Error handling rules

### Capture failure

If GeoHelper cannot capture the current local state before import:

- do not continue with the import
- show a clear failure message such as “导入前恢复锚点创建失败，本次导入已取消”

This is deliberate. The entire purpose of `V7-K` is safety; silently importing without the promised rollback anchor would undermine that.

### Clear action

Clearing the anchor is purely local metadata removal:

- it does not touch current chat/settings state
- it simply removes the stored pre-import envelope

### Restore failure

If restore fails:

- current local state stays as-is
- rollback anchor remains available
- user can retry or export manually

## Non-goals

`V7-K` does not add:

- multi-step local restore history
- cloud rollback anchors
- auto-rollback
- SQL-backed sync/restore
- background imports
- extra backend endpoints

## Testing strategy

### Storage tests

Add focused unit tests for:

- capturing and reading rollback anchor metadata
- replacing previous anchor on a newer capture
- restoring local snapshots from anchor
- clearing anchor after successful restore
- preserving anchor on failed restore path if applicable

### Presentation tests

Add helper tests for rollback anchor summary formatting.

### End-to-end tests

Add UI flows that prove:

1. local import creates a rollback anchor and restore returns the browser to the pre-import snapshot
2. pulled remote import creates a rollback anchor with the correct source labeling and restore works after reload

## Recommendation

Implement `V7-K` as a narrow, browser-only safety layer. It gives the user a real undo path for the riskiest Route 1 action—local-state mutation—without broadening the backend scope or weakening the current explicit/manual recovery model.
