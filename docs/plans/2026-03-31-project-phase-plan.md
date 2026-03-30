# 2026-03-31 Project Phase Plan

Status: Completed on current branch
Scope: close the M4 release gate after the legacy compile-route cutover, refresh current-branch evidence, and confirm the teacher-first studio direction is stable.

## Project Assessment

- Product direction was already largely implemented on main: the homepage, workspace, review flow, canvas linking, and teacher template entry points were present and test-covered.
- The main closure gaps at the start of this pass were verification and evidence gaps rather than large feature gaps.
- The concrete blockers were fourfold: maintainability guards still pointed at removed `compile.ts`, the beta checklist still had unchecked backup-flow items, Redis shared-state had not been revalidated on the current branch, and fresh 2026-03-31 release evidence was incomplete.

## Phase Plan

1. Phase 1: maintainability/test guard sync after legacy compile-route removal.
   Outcome target: move workspace guard expectations from `apps/gateway/src/routes/compile.ts` to `apps/gateway/src/routes/agent-runs.ts`, rerun guard tests, and confirm architecture budgets still hold.
2. Phase 2: checklist/doc closure for backup and remote-sync product scope.
   Outcome target: verify existing tests already cover template recovery, remote backup settings flow, and protected snapshot policy; update README and checklist wording to match the current teacher-first product boundary.
3. Phase 3: live Redis-backed gateway verification.
   Outcome target: stand up shared Redis plus multiple gateway instances, prove revoke/rate-limit/backup retention sharing, then collect live smoke, restore, benchmark, and scheduled-ops evidence against a Redis-backed gateway.
4. Phase 4: studio-facing regression sweep.
   Outcome target: rerun the studio, teacher-template, homepage, and workspace layout E2E flows to confirm the current product surface still matches the intended direction.
5. Phase 5: final RC verification and evidence refresh.
   Outcome target: rerun lint, dependency boundaries, architecture verification, full tests, full E2E, typecheck, build, and dry-run operational gates; record all fresh evidence in `docs/BETA_CHECKLIST.md`.

## Execution Outcome

- Phase 1 completed.
  Evidence: workspace guard tests were updated to use `agent-runs.ts`, `docs/architecture/maintainability-baseline.md` was synced, and the affected workspace tests plus `pnpm verify:architecture` passed.
- Phase 2 completed.
  Evidence: the beta checklist now records 2026-03-31 verification for template backup recovery, remote backup settings flow, and protected snapshot policy; README copy and plan index statuses were aligned with the teacher-first studio direction.
- Phase 3 completed.
  Evidence: `output/ops/manual-phase4/redis-shared-state.json` proves shared revoke, shared rate limiting, and shared backup retention; `output/ops/manual-phase4/smoke-live.json`, `backup-restore-live.json`, `benchmark-live.json`, and `scheduled-live.json` capture Redis-backed live gateway verification; `output/ops/2026-03-31T08-50-00-phase6-redis-live/summary.json` records a successful scheduled verify run.
- Phase 4 completed.
  Evidence: the focused studio/teacher/vnext E2E bundle passed without requiring code changes.
- Phase 5 completed.
  Evidence: the current branch now has fresh 2026-03-31 results for lint, dependency checks, architecture verification, full unit/workspace coverage, full E2E coverage, typecheck, build, and operational dry-run gates.

## Final Status

- Release closure work in this branch is complete.
- No new product regressions were found during the focused or full E2E passes.
- Remaining work, if any, is procedural release management outside this execution branch rather than missing implementation inside the repo.
