# Backend V7-L Import Outcome Summary Design

**Status:** Proposed  
**Date:** 2026-03-14  
**Scope:** Route 1 local-first import feedback and safer rollback context

## Goal

Build on `V7-K` so the user can see what the most recent manual import actually changed, and whether the current browser state is still equal to that imported result before deciding to restore the pre-import rollback anchor.

## Why this is the next Route 1 step

`V7-K` added the missing safety net: before every manual import, GeoHelper now captures one browser-local rollback anchor that can restore the pre-import local state.

That closes the worst failure mode, but there is still one usability gap after the import succeeds:

- the user can restore, but cannot quickly see what the import changed
- the user can come back later, but cannot tell whether the current local state is still the imported result or has already diverged
- the rollback button stays safe, but its tradeoff is not explicit once the user continues editing after import

For Route 1, the next best step is still local-first and browser-only:

- no SQL
- no backend timeline
- no background diff jobs
- no multi-step local history browser

Instead, we enrich the existing rollback anchor with one post-import result snapshot and compute small, human-readable summaries in the settings drawer.

## Chosen shape

### Extend the single-slot rollback anchor

Keep the existing one-slot rollback anchor model from `V7-K`, but add optional post-import metadata:

- `importedAt`
- `resultEnvelope`

The anchor then represents one complete import context:

- what the local state was before import
- where the import came from
- which mode was used
- what the local state became after the import completed

This avoids creating a second loosely-related storage record and keeps “undo this last import” as one clear browser-local artifact.

### One enriched settings card

Do not add a new modal or a second settings card. Reuse the existing rollback card and expand it with:

- pre-import snapshot summary
- post-import snapshot summary
- actual import outcome summary
- current-state relation to the imported result

That keeps the feature discoverable without increasing visual noise.

## UX behavior

### After a successful import

When a local-file or pulled-remote import succeeds:

1. capture already-created rollback anchor remains in storage
2. export the new current local state
3. write it back into that same anchor as `resultEnvelope`
4. reload as today

On the next settings open, the rollback card shows:

- import source
- import mode
- pre-import local snapshot
- post-import local snapshot
- actual conversation-level change summary

### Rollback context safety

If current local state still matches the post-import snapshot, the card says the latest import result is still the active local state.

If current local state no longer matches the post-import snapshot, the card warns that the browser state has changed again after import and that restoring the rollback anchor will also discard those newer local changes.

This is the key `V7-L` safety improvement: the rollback button remains available, but the user gets explicit context before clicking it.

## Presentation rules

### Merge imports

For merge imports, show actual results relative to the pre-import local state:

- how many new conversation ids were added
- how many same-id conversations changed
- current conversation total after import

This answers “what did merge really do?” without pretending to reconstruct a full patch UI.

### Replace imports

For replace imports, show a compact before/after summary plus added/removed counts:

- conversation total before import
- conversation total after import
- how many previous conversation ids disappeared
- how many newly introduced ids appeared

This keeps replace feedback concrete and easy to scan.

### Current-state relation

Compare current local summary against the stored post-import `resultEnvelope`:

- identical → “still at imported result”
- otherwise → “local state changed after import”

We do not expose the full relation taxonomy in the UI here. The user only needs to know whether rollback would undo only the import or also later local edits.

## Data model and storage

Extend `ImportRollbackAnchor` in `apps/web/src/storage/backup.ts` with optional fields:

```ts
interface ImportRollbackAnchor {
  capturedAt: string;
  source: "local_file" | "remote_latest" | "remote_selected_history";
  importMode: "merge" | "replace";
  sourceDetail: string | null;
  envelope: BackupEnvelope;
  importedAt?: string;
  resultEnvelope?: BackupEnvelope;
}
```

Add one storage helper to update the existing anchor after import success, owned by the backup storage module rather than the settings UI.

## Non-goals

`V7-L` does not add:

- multi-import local timeline
- import diff browser
- per-message diff rendering
- cloud rollback anchors
- SQL-backed chat history sync
- new backend endpoints

## Testing strategy

### Storage

Add tests for:

- recording a post-import result onto the existing anchor
- reading legacy anchors without result data
- preserving the anchor until explicit clear/restore

### Presentation

Add helper tests for:

- merge-result summary formatting
- replace-result summary formatting
- “current state unchanged after import” copy
- “current state changed after import” warning copy

### End-to-end

Add settings flows proving:

1. local import shows both pre-import and post-import summaries after reload
2. a subsequent local mutation changes the rollback warning copy to explain that restoring now would discard post-import changes too

## Recommendation

Implement `V7-L` as a narrow extension of `V7-K`: keep one browser-local rollback anchor, enrich it with post-import outcome context, and surface only the information that helps the user answer one question safely:

“如果我现在回滚，会撤销的到底只是刚才那次导入，还是连导入之后我继续改的内容也一起撤销？”
