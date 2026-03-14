# Backend V7-M Rollback Anchor Overwrite Guard Design

**Status:** Proposed  
**Date:** 2026-03-14  
**Scope:** Route 1 local-first import safety before replacing the current undo point

## Goal

Prevent the next manual import from silently replacing the only browser-local rollback anchor that currently protects the previous import.

## Why this is the next Route 1 step

`V7-K` introduced a single rollback anchor before each manual import.  
`V7-L` then made that anchor much more understandable by showing what the import actually changed and whether the current browser state has diverged afterward.

That still leaves one sharp edge:

- the rollback anchor is intentionally single-slot
- any later manual import will capture a new pre-import snapshot
- that new capture silently replaces the previous undo point
- users experimenting with multiple imports in one session can lose their last safe recovery point without noticing

For Route 1, the next best improvement is still browser-only and deliberately narrow:

- no SQL
- no backend timeline
- no multi-entry local history
- no auto-export side effects

Instead, GeoHelper should explicitly warn when a pending import is about to replace the current rollback anchor and require a clear second confirmation before that overwrite happens.

## Explored approaches

### Option A: Inline overwrite guard on import actions (recommended)

When a rollback anchor already exists, any new import action that would capture a replacement anchor first switches into an armed confirmation state.

Benefits:

- smallest behavioral change
- consistent with `V7-J` replace-import confirmation
- keeps the flow inline inside the existing local-import preview and pulled-remote preview cards
- does not broaden storage scope or backend scope

Tradeoff:

- one extra click on merge imports only when an existing rollback anchor would be replaced

### Option B: Auto-export the old rollback anchor before replacing it

This would preserve the previous undo point by downloading or storing another artifact automatically.

Rejected because:

- silent file creation/download is surprising
- it turns a focused recovery affordance into implicit local history
- cleanup/discoverability becomes messy quickly

### Option C: Multi-slot rollback anchor history in browser storage

This would retain several import undo points locally.

Rejected because:

- it is materially broader than Route 1 needs right now
- it introduces retention policy, browsing UI, and restore-selection complexity
- it starts to resemble a local versioning system rather than a narrow import guard

## Chosen shape

### Reuse the existing inline confirmation model

Adopt Option A and extend the import button presentation layer so it can reason about two risks:

1. replace import will overwrite current local data
2. any import with an existing rollback anchor will overwrite the current rollback anchor

The user experience stays inline:

- no new modal
- no new settings card
- no new storage record

Instead, the relevant import button changes label on first click and the preview card shows a warning that names the overwrite being confirmed.

### Keep confirmations combined, not stacked

`V7-J` already requires a second click for dangerous replace imports. `V7-M` should not introduce a third click.

If both risks apply at the same time:

- local data overwrite
- rollback anchor replacement

the UI should show one combined warning and still require only one armed confirmation cycle for that specific action.

### Guard both local-file and pulled-remote imports

The overwrite problem exists for every manual import entry point:

1. local file -> merge import
2. local file -> replace import
3. pulled remote preview -> merge import
4. pulled remote preview -> replace import

So the guard must apply consistently across both preview surfaces.

## UX behavior

### No existing rollback anchor

Behavior stays as today:

- merge import remains one click
- replace import keeps the existing `V7-J` second-click confirmation

### Existing rollback anchor present

When a rollback anchor exists and the user attempts another import:

- the preview shows a warning that the current rollback anchor will be replaced by a new pre-import snapshot
- merge import becomes an armed action instead of immediate execution
- replace import keeps its armed behavior, but the warning copy now also explains that the existing rollback anchor will be replaced

The warning should be concrete enough to remind the user what they are about to lose, for example by referencing the current rollback anchor source and capture time through shared presentation helpers.

### Reset rules

The armed state must reset whenever the import context changes, including:

- selected local file changes
- local import preview is cancelled
- pulled remote preview changes or is cleared
- rollback anchor is cleared or restored

This keeps confirmation state tightly bound to the action the user is currently looking at.

## Data and presentation boundaries

`V7-M` does not need new persisted storage fields.

The storage contract remains:

- one rollback anchor in browser storage
- optional `resultEnvelope`/`importedAt` from `V7-L`

The new logic lives in presentation and transient UI state:

- one shared helper that resolves import-button labels/warnings from scope, mode, armed state, and rollback-anchor presence
- small per-surface armed flags in `SettingsDrawer.tsx`

This preserves the clean separation already used across the remote-backup settings flow:

- storage module owns snapshots
- presentation helpers own user-facing copy/state derivation
- settings drawer wires actions and temporary UI state

## Non-goals

`V7-M` does not add:

- multi-entry local rollback history
- automatic export of replaced anchors
- backend rollback storage
- SQL-backed sync/history
- background imports
- new gateway endpoints

## Testing strategy

### Presentation

Add helper tests covering:

- merge import without anchor -> no overwrite warning
- merge import with anchor -> armed overwrite confirmation
- replace import without anchor -> existing `V7-J` copy still works
- replace import with anchor -> combined warning, still one armed cycle

### End-to-end

Add UI flows proving:

1. a second local import warns that the current rollback anchor will be replaced before merge import proceeds
2. a pulled remote import does the same
3. replace import with an existing rollback anchor still uses only one confirmation cycle, not two separate cycles

## Recommendation

Implement `V7-M` as a narrow follow-on safety layer to `V7-K` and `V7-L`: keep the single-slot rollback anchor model, but stop replacing that slot silently.

The user should always know when the next import is also replacing their current undo point.
