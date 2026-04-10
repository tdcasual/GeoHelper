# Release-Candidate Live Validation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn the clean post-cutover platform baseline into a real release candidate with shared-staging evidence, operator-grade portability audits, and regression protection for the converged left-canvas/right-dialog workspace shell.

**Architecture:** Treat the next phase as live-validation closure, not another architecture rewrite. Keep the current `web + gateway + control-plane` topology and current platform-agent contract intact, and close only the remaining sign-off gaps: explicit release evidence contract, remote platform-run smoke, operator-visible bundle audit details, and end-to-end coverage for the new shell. Do not reopen legacy compatibility work or start new product tracks in this phase.

**Tech Stack:** TypeScript, React, Fastify, Node ops scripts, Playwright, Vitest, shell smoke scripts, EdgeOne deploy docs, GeoHelper platform packages

---

## Finish Definition

This phase is complete only when all of the following are true:

1. The release checklist no longer stops at localhost proof and instead names the exact shared-staging evidence expected before sign-off.
2. One command can exercise the remote gateway + control-plane runtime path, capture portable-bundle extraction audit data, and land a machine-readable release-candidate summary artifact.
3. Operators can read `rehearsedExtractionCandidate`, `verifyImport`, and `extractionBlockers` from the web settings audit surface instead of reconstructing release status from raw JSON alone.
4. Playwright coverage protects the intended desktop shell contract: stable left GeoGebra canvas, stable right dialog rail, history as an overlay, and working runtime/session flows after the layout convergence.
5. One dated shared-staging pass is recorded in `docs/BETA_CHECKLIST.md` with artifact paths or explicit blockers.

Anything outside that boundary is deferred.

## Scope Freeze Rules

During this phase, do not start new work in these areas:

1. New agent capabilities, new domain packages, or deeper workflow redesign.
2. New backend services beyond the current `gateway + control-plane (+ optional worker)` topology.
3. Fresh UI redesigns unrelated to release validation, operator auditability, or regression coverage.
4. Compatibility shims for pre-cutover GeoHelper agent implementations.

---

## Task 1: Freeze The Release-Candidate Evidence Contract In Docs And Tests

**Files:**
- Modify: `docs/BETA_CHECKLIST.md`
- Modify: `docs/deploy/edgeone.md`
- Modify: `README.md`
- Modify: `tests/workspace/beta-checklist.test.ts`
- Modify: `tests/workspace/deploy-docs.test.ts`

**Step 1: Write the failing doc assertions**

Extend the workspace doc tests so they assert all release docs now mention:

- shared-staging / external live evidence as a first-class phase instead of a footnote
- `CONTROL_PLANE_URL` alongside `GATEWAY_URL`
- `pnpm smoke:platform-run-remote`
- published artifact URLs plus the dated release-candidate summary JSON as the operator source of truth
- OpenClaw rehearsal evidence through `rehearsedExtractionCandidate`, `verifyImport`, and `extractionBlockers`

**Step 2: Run the failing doc tests**

Run:

```bash
pnpm test -- tests/workspace/beta-checklist.test.ts tests/workspace/deploy-docs.test.ts
```

Expected: FAIL because the current docs still stop short of an explicit remote platform-run smoke contract and dated release-candidate summary artifact.

**Step 3: Update the docs with the minimal sign-off contract**

Document:

- the exact env floor for shared-staging validation: `GATEWAY_URL`, `CONTROL_PLANE_URL`, `PRESET_TOKEN`, optional `ADMIN_METRICS_TOKEN`
- the expected command order for release-candidate validation
- where artifacts are written and which file is the sign-off summary
- that the checklist must be updated with an exact date and artifact directory after each real pass

**Step 4: Re-run the doc tests**

Run:

```bash
pnpm test -- tests/workspace/beta-checklist.test.ts tests/workspace/deploy-docs.test.ts
```

Expected: PASS.

**Step 5: Commit**

Run:

```bash
git add docs/BETA_CHECKLIST.md docs/deploy/edgeone.md README.md tests/workspace/beta-checklist.test.ts tests/workspace/deploy-docs.test.ts
git commit -m "docs: freeze release-candidate evidence contract"
```

## Task 2: Add Remote Platform-Run Smoke And A One-Command Release-Candidate Runner

**Files:**
- Modify: `package.json`
- Create: `scripts/smoke/platform-run-remote.mjs`
- Create: `scripts/ops/run-release-candidate-live-checks.mjs`
- Modify: `scripts/ops/lib/artifact-paths.mjs`
- Modify: `scripts/ops/lib/publish-artifacts.mjs`
- Create: `tests/workspace/platform-run-remote-smoke.test.ts`
- Create: `tests/workspace/release-candidate-live-checks.test.ts`
- Modify: `docs/deploy/edgeone.md`
- Modify: `docs/BETA_CHECKLIST.md`

**Step 1: Write the failing contract tests**

Cover:

- root `package.json` exposes `smoke:platform-run-remote` and `ops:release-candidate:live`
- the remote smoke script targets `POST /api/v1/auth/token/login`, `POST /api/v3/threads`, `POST /api/v3/threads/:threadId/runs`, and `GET /api/v3/runs/:runId/stream`
- the release-candidate runner writes one compact summary JSON that includes at least `gatewayRuntime`, `backupRestore`, `platformRun`, `bundleAudit`, and `scheduledVerify`

**Step 2: Run the failing tests**

Run:

```bash
pnpm test -- tests/workspace/platform-run-remote-smoke.test.ts tests/workspace/release-candidate-live-checks.test.ts
```

Expected: FAIL because the repo currently has only the local `platform-run-live` smoke and no one-command remote release-candidate wrapper.

**Step 3: Implement the minimal remote validation path**

Add:

- `pnpm smoke:platform-run-remote` for remote `gateway + control-plane` official-flow smoke
- `pnpm ops:release-candidate:live` to orchestrate:
  - `pnpm smoke:gateway-runtime`
  - `pnpm smoke:gateway-backup-restore`
  - `pnpm smoke:platform-run-remote`
  - `pnpm ops:gateway:scheduled`
  - one `POST /admin/bundles/:bundleId/export-openclaw` call with `{"verifyImport":true}`
- one compact `release-candidate-summary.json` under the run artifact directory that records command status, key probe outcomes, artifact URLs, and bundle portability audit results

Use `RELEASE_BUNDLE_ID=geometry_reviewer` as the default rehearsal candidate unless the operator overrides it.

**Step 4: Re-run the focused tests and script lint**

Run:

```bash
pnpm test -- tests/workspace/platform-run-remote-smoke.test.ts tests/workspace/release-candidate-live-checks.test.ts
pnpm exec eslint scripts/ops scripts/smoke tests/workspace
```

Expected: PASS.

**Step 5: Commit**

Run:

```bash
git add package.json scripts/smoke/platform-run-remote.mjs scripts/ops/run-release-candidate-live-checks.mjs scripts/ops/lib/artifact-paths.mjs scripts/ops/lib/publish-artifacts.mjs tests/workspace/platform-run-remote-smoke.test.ts tests/workspace/release-candidate-live-checks.test.ts docs/deploy/edgeone.md docs/BETA_CHECKLIST.md
git commit -m "feat: add release-candidate live validation runner"
```

## Task 3: Promote Portable-Bundle Audit Into An Operator Sign-Off Surface

**Files:**
- Modify: `apps/web/src/runtime/types.ts`
- Modify: `apps/web/src/runtime/control-plane-client.ts`
- Modify: `apps/web/src/runtime/control-plane-client.test.ts`
- Modify: `apps/web/src/state/platform-bundle-catalog.ts`
- Modify: `apps/web/src/components/settings-drawer/SettingsGeneralSection.tsx`
- Modify: `apps/web/src/components/settings-drawer/SettingsGeneralSection.test.tsx`

**Step 1: Write the failing UI/client tests**

Extend the current settings audit coverage so it expects each bundle row to surface:

- whether it is the `rehearsedExtractionCandidate`
- the latest `verifyImport` result when present
- explicit `extractionBlockers`
- a clearer portable-vs-host-bound badge for release sign-off, not only raw host-bound tools

**Step 2: Run the failing tests**

Run:

```bash
pnpm test -- apps/web/src/runtime/control-plane-client.test.ts apps/web/src/components/settings-drawer/SettingsGeneralSection.test.tsx
```

Expected: FAIL because the current web audit surface only shows import mode and host-bound tool summaries.

**Step 3: Implement the minimal operator audit UI**

Update the control-plane client and settings section so the control-plane bundle catalog preserves and renders:

- `rehearsedExtractionCandidate`
- `verifyImport`
- `extractionBlockers`
- a compact release-signoff summary per bundle

Do not add a new admin page in this task. Keep the operator view inside the existing settings audit panel.

**Step 4: Re-run focused web verification**

Run:

```bash
pnpm test -- apps/web/src/runtime/control-plane-client.test.ts apps/web/src/components/settings-drawer/SettingsGeneralSection.test.tsx
pnpm exec eslint apps/web/src/runtime apps/web/src/state apps/web/src/components/settings-drawer
pnpm exec tsc -p apps/web/tsconfig.json --noEmit
```

Expected: PASS.

**Step 5: Commit**

Run:

```bash
git add apps/web/src/runtime/types.ts apps/web/src/runtime/control-plane-client.ts apps/web/src/runtime/control-plane-client.test.ts apps/web/src/state/platform-bundle-catalog.ts apps/web/src/components/settings-drawer/SettingsGeneralSection.tsx apps/web/src/components/settings-drawer/SettingsGeneralSection.test.tsx
git commit -m "feat: surface portable bundle release audits"
```

## Task 4: Extend E2E Protection For The New Workspace Shell And Runtime Flows

**Files:**
- Modify: `tests/e2e/vnext-workspace-layout.spec.ts`
- Modify: `tests/e2e/platform-run-console.spec.ts`
- Modify: `tests/e2e/official-session.spec.ts`
- Modify: `tests/e2e/settings-drawer.remote-sync.spec.ts`
- Modify: `tests/e2e/geogebra.test-helpers.ts`
- Modify only if tests reveal regressions: `apps/web/src/components/workspace-shell/WorkspaceDesktopLayout.tsx`
- Modify only if tests reveal regressions: `apps/web/src/components/workspace-shell/WorkspaceConversationSidebar.tsx`
- Modify only if tests reveal regressions: `apps/web/src/styles/workspace-shell.css`

**Step 1: Write the failing E2E assertions**

Cover:

- history drawer opens as an overlay without shrinking the left canvas below the right rail
- platform run console remains readable after history open/close
- official-session expiry warning remains reachable in the right dialog rail
- settings remote-backup entrypoints remain accessible after the desktop shell convergence

**Step 2: Run the focused E2E slice**

Run:

```bash
pnpm test:e2e -- tests/e2e/vnext-workspace-layout.spec.ts tests/e2e/platform-run-console.spec.ts tests/e2e/official-session.spec.ts tests/e2e/settings-drawer.remote-sync.spec.ts
```

Expected: FAIL in at least one place before implementation because the current E2E coverage does not yet treat the converged shell as a protected release contract.

**Step 3: Implement only the smallest regression fixes**

If failures are real, patch only the shell/layout behavior necessary to restore:

- stable left canvas
- stable right dialog rail
- overlay history behavior
- reachable session/runtime/settings controls

Use `superpowers:systematic-debugging` if the failures are flaky or renderer-specific.

**Step 4: Re-run the E2E slice**

Run:

```bash
pnpm test:e2e -- tests/e2e/vnext-workspace-layout.spec.ts tests/e2e/platform-run-console.spec.ts tests/e2e/official-session.spec.ts tests/e2e/settings-drawer.remote-sync.spec.ts
```

Expected: PASS.

**Step 5: Commit**

Run:

```bash
git add tests/e2e/vnext-workspace-layout.spec.ts tests/e2e/platform-run-console.spec.ts tests/e2e/official-session.spec.ts tests/e2e/settings-drawer.remote-sync.spec.ts tests/e2e/geogebra.test-helpers.ts apps/web/src/components/workspace-shell/WorkspaceDesktopLayout.tsx apps/web/src/components/workspace-shell/WorkspaceConversationSidebar.tsx apps/web/src/styles/workspace-shell.css
git commit -m "test: harden workspace shell release flows"
```

## Task 5: Execute One Shared-Staging Pass And Record Dated Release Evidence

**Files:**
- Modify: `docs/BETA_CHECKLIST.md`
- Modify: `docs/deploy/edgeone.md`
- Verify: `output/ops/<timestamp>/release-candidate-summary.json`
- Verify: `output/ops/<timestamp>/summary.json`

**Step 1: Run the shared-staging pass**

Run:

```bash
GATEWAY_URL=https://<gateway-domain> \
CONTROL_PLANE_URL=https://<control-plane-domain> \
PRESET_TOKEN=<preset-token> \
ADMIN_METRICS_TOKEN=<admin-token> \
RELEASE_BUNDLE_ID=geometry_reviewer \
pnpm ops:release-candidate:live
```

Expected: one timestamped run directory under `output/ops/` containing:

- `release-candidate-summary.json`
- the scheduled verify artifacts
- the recorded bundle export audit

**Step 2: Review the evidence**

Confirm:

- gateway smoke is green
- control-plane run/stream smoke is green
- backup restore smoke is green
- scheduled verify is green or has explicit threshold blockers
- bundle audit shows one rehearsal candidate plus reviewed blockers

**Step 3: Update the dated release checklist**

Record the exact execution date, target domains, and artifact directory in `docs/BETA_CHECKLIST.md`. If the pass is blocked by missing credentials or staging drift, document the exact blocker instead of leaving the state implicit.

**Step 4: Run the final verification floor**

Run:

```bash
pnpm typecheck
pnpm --filter @geohelper/gateway test
pnpm --filter @geohelper/control-plane test
pnpm --filter @geohelper/web test
pnpm test -- tests/workspace/beta-checklist.test.ts tests/workspace/deploy-docs.test.ts tests/workspace/platform-run-remote-smoke.test.ts tests/workspace/release-candidate-live-checks.test.ts
```

Expected: PASS before calling the phase complete.

**Step 5: Commit**

Run:

```bash
git add docs/BETA_CHECKLIST.md docs/deploy/edgeone.md
git commit -m "docs: record release-candidate live evidence"
```
