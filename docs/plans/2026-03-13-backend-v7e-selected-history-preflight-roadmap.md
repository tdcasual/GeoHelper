# Backend V7-E Selected History Preflight Roadmap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a lightweight preflight compare for the selected retained remote snapshot so users can see whether that specific recovery point is identical to, newer than, older than, or diverged from the current local snapshot before pulling or importing it.

**Architecture:** Keep Route 1 local-first and snapshot-based. Reuse the existing snapshot summary contract rather than adding SQL or server-authoritative cloud history. Move summary comparison logic into the shared protocol layer so gateway and web can speak the same compare semantics, then surface the selected-snapshot relation inside the settings recovery UI without introducing background sync or automatic restore behavior.

**Tech Stack:** `@geohelper/protocol`, existing gateway backup summary model, React settings drawer, Zustand settings state, Vitest, existing settings backup UI coverage.

---

### Task 1: Extract shared comparable-summary compare logic

**Files:**
- Modify: `packages/protocol/src/backup.ts`
- Modify: `packages/protocol/test/backup.test.ts`
- Modify: `apps/gateway/src/services/backup-store.ts`

**Step 1: Write the failing test**
- Add protocol tests for comparing two snapshot summaries without full envelopes:
  - identical checksum
  - local extends remote
  - remote extends local
  - timestamp fallback divergence/newness

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @geohelper/protocol test`

Expected: FAIL because protocol only compares full envelopes today.

**Step 3: Write minimal implementation**
- Add a shared `BackupComparableSummary` shape in `packages/protocol/src/backup.ts`.
- Add `compareBackupComparableSummaries(local, remote)`.
- Refactor `compareBackupEnvelopes()` to reuse the shared summary comparison path.
- Refactor `apps/gateway/src/services/backup-store.ts` to reuse the protocol helper instead of keeping its own divergent algorithm.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @geohelper/protocol test`

Expected: PASS.

### Task 2: Surface selected-history preflight comparison in settings

**Files:**
- Modify: `apps/web/src/components/settings-remote-backup.ts`
- Modify: `apps/web/src/components/settings-remote-backup.test.ts`
- Modify: `apps/web/src/components/SettingsDrawer.tsx`

**Step 1: Write the failing test**
- Add helper tests that resolve selected-history comparison presentation from:
  - local summary + selected summary identical
  - local summary newer
  - selected remote summary newer
  - diverged
- Assert the presentation text is explicit and recovery-oriented.

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @geohelper/web test -- --run src/components/settings-remote-backup.test.ts`

Expected: FAIL because settings helpers do not expose selected-history comparison presentation yet.

**Step 3: Write minimal implementation**
- Add a selected-history comparison presentation helper that consumes:
  - current local summary from the latest compare result
  - selected retained remote snapshot summary
- Show this relation in `SettingsDrawer.tsx` near the selected retained snapshot details.
- Keep the feature read-only:
  - no auto pull
  - no auto import
  - no status mutation beyond display text

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @geohelper/web test -- --run src/components/settings-remote-backup.test.ts`

Expected: PASS.

### Task 3: Refresh docs and verify the focused matrix

**Files:**
- Modify: `README.md`
- Modify: `docs/user/settings-backup-recovery.md`
- Modify: `docs/plans/README.md`

**Step 1: Update docs**
- Explain that the retained-history selector now shows a preflight relation versus the current local snapshot before users pull/import the selected snapshot.
- Keep language precise: this is still snapshot-based recovery guidance, not full cloud chat history.

**Step 2: Run focused verification**

Run:
- `pnpm --filter @geohelper/protocol test`
- `pnpm --filter @geohelper/web test -- --run src/components/settings-remote-backup.test.ts src/state/settings-store.test.ts`
- `pnpm typecheck`

Expected: PASS.
