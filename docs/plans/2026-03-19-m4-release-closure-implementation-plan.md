# GeoHelper M4 Release Closure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Finish the current GeoHelper scope as fast as possible by shipping the existing teacher-studio + local-first recovery + self-hosted gateway baseline, without opening new product tracks.

**Architecture:** Treat the next phase as release closure, not feature expansion. Keep the current `teacher-first diagram studio`, `local-first browser state`, and `single-tenant self-hosted gateway` as the release baseline. Close only the remaining ship-critical gates: release verification, staging evidence, and the legacy compile observation handoff. Do not let optional cleanup or new UX ambitions delay M4.

**Tech Stack:** React 19, TypeScript, Fastify, Zustand, Vitest, Playwright, Node ops scripts, shell smoke scripts, EdgeOne deploy docs, self-hosted gateway runtime

---

## Finish Definition

For this phase, “project complete enough to ship M4” means all of the following are true:

1. The current teacher studio main flow is stable on desktop and compact/mobile layouts.
2. The local-first backup / remote recovery / self-hosted gateway flows pass the documented release gate.
3. The release checklist is green locally and on one staging candidate.
4. The legacy compile route is no longer blocking release:
   - internal callers are already migrated
   - the route is deprecated and observable
   - external-consumer observation starts immediately
   - final deletion is tracked as a cleanup cut, not as the M4 ship blocker

Anything outside that boundary is deferred.

## Scope Freeze Rules

During this phase, do not start new work in these areas:

1. New teacher-studio feature lines such as formal demo mode, export pipeline, or richer proof tooling.
2. New gateway/backend product surface area.
3. Any cloud/SaaS expansion: accounts, multi-tenant state, SQL, server-authoritative sync.
4. Major UI redesign unrelated to the release gate.

If a task does not directly shorten the path to M4 ship readiness, it should not enter this phase.

## Priority Order

### P0: Ship-Critical

1. Run the full M4 release gate and fix blockers.
2. Produce one staging candidate with evidence artifacts.
3. Start and document the legacy compile external-consumer observation window.

### P1: Parallel but Non-Blocking

1. Final deletion of `/api/v1/chat/compile` after observation is clean.
2. Additional teacher-studio polish that does not affect current release gates.

### Explicitly Deferred

1. Formal classroom demo / presentation mode.
2. Export / slideshow / handout pipeline.
3. New proof-assist depth beyond the current scaffold.
4. Any non-essential maintainability refactor that is not tied to a failing gate.

---

## Task 1: Freeze The M4 Ship Boundary

**Files:**
- Modify: `docs/BETA_CHECKLIST.md`
- Modify: `docs/plans/2026-03-17-product-scope-reset-design.md`
- Modify: `docs/plans/README.md`

**Outcome:**

Document that M4 is a release-closure phase around the current product boundary, and explicitly move these items out of the ship path:

1. final hard deletion of `/api/v1/chat/compile`
2. demo/export/presentation work
3. any backend expansion beyond the current gateway

**Steps:**

1. Update `docs/BETA_CHECKLIST.md` to add one short M4 note:
   - internal migration to `/api/v2/agent/runs` is already complete
   - external legacy-route observation is required
   - hard route deletion is post-observation cleanup, not a release blocker
2. Add one short note to `docs/plans/2026-03-17-product-scope-reset-design.md` that the next phase is release closure, not new feature expansion.
3. Add this plan to `docs/plans/README.md` so the release path is discoverable.
4. Verify doc smoke tests still pass.

**Verification:**

Run:

```bash
pnpm test -- tests/workspace/deploy-docs.test.ts tests/workspace/legacy-compile-cutover-docs.test.ts
```

Expected: PASS.

---

## Task 2: Run The Full M4 Release Gate And Fix Only Real Blockers

**Files:**
- Verify: `docs/BETA_CHECKLIST.md`
- Modify only the files implicated by failing commands
- Likely hotspots:
  - `apps/web/src/**`
  - `apps/gateway/src/**`
  - `tests/e2e/**`
  - `tests/workspace/**`
  - `scripts/ops/**`
  - `scripts/smoke/**`

**Outcome:**

Turn the current draft release checklist into a fully green local release candidate.

**Steps:**

1. Run the full local release gate in this exact order:

```bash
pnpm lint
pnpm deps:check
pnpm verify:architecture
pnpm test
pnpm --filter @geohelper/gateway test
pnpm --filter @geohelper/web test
pnpm test:e2e
pnpm bench:quality -- --dry-run
pnpm ops:gateway:verify -- --dry-run
pnpm ops:gateway:scheduled -- --dry-run
pnpm smoke:gateway-runtime -- --dry-run
pnpm smoke:gateway-backup-restore -- --dry-run
pnpm typecheck
pnpm build:web
```

2. For each failure, fix only the smallest ship-blocking issue. Do not add opportunistic features while repairing.
3. Re-run only the failing command until it passes.
4. After all individual failures are green, re-run the full gate once from top to bottom.
5. Mark the corresponding checklist items in `docs/BETA_CHECKLIST.md`.

**Success criteria:**

1. Every command exits `0`.
2. No release-blocking warning remains unexplained.
3. The checklist is updated with the actual evidence date.

---

## Task 3: Produce One Staging Candidate With Evidence

**Files:**
- Modify: `docs/deploy/edgeone.md` only if staging instructions are inaccurate
- Verify: `scripts/deploy/**`
- Verify: `scripts/ops/**`
- Verify: `scripts/smoke/**`

**Outcome:**

Have one release candidate that is not only green locally, but also proven on the intended deployment path.

**Steps:**

1. Build one staging candidate:

```bash
pnpm geogebra:sync
pnpm build:web
```

2. Run the documented dry-run staging evidence commands:

```bash
pnpm ops:gateway:verify -- --dry-run
pnpm ops:gateway:scheduled -- --dry-run
pnpm smoke:gateway-runtime -- --dry-run
pnpm smoke:gateway-backup-restore -- --dry-run
pnpm ops:legacy-compile-check -- --dry-run
```

3. If a live staging gateway is available, run the live operator checks with real env vars:

```bash
GATEWAY_URL=https://<gateway-domain> \
ADMIN_METRICS_TOKEN=<admin-token> \
pnpm smoke:gateway-runtime

GATEWAY_URL=https://<gateway-domain> \
ADMIN_METRICS_TOKEN=<admin-token> \
pnpm smoke:gateway-backup-restore

GATEWAY_URL=https://<gateway-domain> \
ADMIN_METRICS_TOKEN=<admin-token> \
pnpm ops:legacy-compile-check
```

4. Persist and review the generated `output/ops/<timestamp>/` artifacts.
5. Record the staging evidence in `docs/BETA_CHECKLIST.md` or the release handoff note.

**Success criteria:**

1. One staging candidate is built successfully.
2. Dry-run evidence is green.
3. Live evidence is green where environment access exists.

---

## Task 4: Start Legacy Compile Observation, But Do Not Let It Block M4

**Files:**
- Verify: `docs/deploy/legacy-compile-external-consumer-checklist.md`
- Verify: `scripts/ops/check-legacy-compile-consumers.mjs`
- Reference: `docs/plans/2026-03-19-legacy-compile-route-migration-plan.md`

**Outcome:**

The final deletion of `/api/v1/chat/compile` is converted from “unclear future cleanup” into a tracked, observable post-ship cut.

**Steps:**

1. Start the observation window immediately using:

```bash
GATEWAY_URL=https://<gateway-domain> \
ADMIN_METRICS_TOKEN=<admin-token> \
pnpm ops:legacy-compile-check
```

2. Follow `docs/deploy/legacy-compile-external-consumer-checklist.md` for:
   - legacy hit review
   - trace drill-down
   - access-log cross-check
   - known consumer confirmation
3. Continue observing for the target 7-day window.
4. Treat this as parallel work during M4 closure, not as a blocker to shipping the already-deprecated compatibility shell.
5. Only after sign-off is complete, execute Task 5 from `docs/plans/2026-03-19-legacy-compile-route-migration-plan.md`:
   - remove route registration
   - delete legacy route helpers/tests
   - update docs to v2-only

**Success criteria:**

1. Observation begins now, not “later”.
2. The sign-off owner and evidence source are clear.
3. Final hard deletion is the first post-ship cleanup cut, not a fuzzy backlog item.

---

## Task 5: Release Decision And Post-Ship Queue Split

**Files:**
- Modify: `docs/BETA_CHECKLIST.md`
- Modify: release handoff note or ship ticket
- Reference: `docs/plans/2026-03-19-legacy-compile-route-migration-plan.md`

**Outcome:**

End the phase with a clear `GO / NO-GO` decision and a small, explicit post-ship queue.

**Steps:**

1. If Tasks 1-3 are green, mark M4 as release-ready.
2. Open a separate post-ship cleanup item for:
   - legacy compile route hard deletion
   - any deferred demo/export work
   - any non-blocking polish discovered during release verification
3. Do not carry those items back into the M4 gate once the ship decision is green.

**Success criteria:**

1. One clear release decision exists.
2. Deferred work is tracked separately.
3. The project is considered “complete for M4” without reopening scope.

---

## Recommended Execution Path

If the goal is the fastest possible completion, execute the next phase in this exact order:

1. `Task 1`: freeze the boundary
2. `Task 2`: run the full release gate
3. `Task 3`: produce staging evidence
4. `Task 4`: start legacy-route observation in parallel
5. `Task 5`: make the ship decision

The key strategic decision in this plan is deliberate:

1. ship M4 with the legacy compile route still present but deprecated
2. do not delay completion on a 7-day observation window
3. treat final route deletion as the first post-ship cleanup cut once observation is clean
