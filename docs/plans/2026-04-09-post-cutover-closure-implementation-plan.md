# Post-Cutover Closure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move the current platform-agent cutover from an actively changing refactor branch to a clean, releasable, OpenClaw-extractable baseline with explicit topology, explicit UI direction, and explicit release gates.

**Architecture:** Treat the current branch as a post-cutover stabilization phase instead of a feature-discovery phase. The work is split into four execution tracks: control-plane release parity, ops artifact closure, workspace-shell convergence, and OpenClaw extraction rehearsal. Do not preserve compatibility with the older GeoHelper agent design except for intentional OpenClaw-facing terms such as `acp-agent` and `acpAgentDelegations`.

**Tech Stack:** TypeScript, React, Vite, Fastify, Vitest, shell scripts, Docker, GitHub Actions, GeoHelper platform packages

---

## Prerequisite: Freeze the current dirty worktree before starting new feature work

**Files:**
- Modify: current tracked files already in the worktree

**Step 1: Run the current verification floor**

Run:
- `pnpm typecheck`
- `pnpm --filter @geohelper/gateway test`
- `pnpm --filter @geohelper/control-plane test`
- `pnpm --filter @geohelper/web test`

Expected: PASS before new work starts.

**Step 2: Create a checkpoint commit**

Run:
- `git add -A`
- `git commit -m "feat: checkpoint post-cutover platform baseline"`

Expected: the next tasks begin from a stable checkpoint instead of a half-moving branch tip.

## Task 1: Give control-plane the same release parity as gateway

**Files:**
- Modify: `package.json`
- Create: `.github/workflows/control-plane-image.yml`
- Modify: `apps/control-plane/Dockerfile`
- Modify: `README.md`
- Modify: `docs/deploy/edgeone.md`
- Modify: `docs/BETA_CHECKLIST.md`
- Test: `tests/workspace/control-plane-image-contract.test.ts`

**Step 1: Write the failing contract test**

Create a repo-level test that asserts:
- root `package.json` exposes a `docker:control-plane:build` script
- a `control-plane-image.yml` workflow exists
- deploy docs mention the control-plane image and tag strategy

**Step 2: Run the failing test**

Run:
- `pnpm test -- tests/workspace/control-plane-image-contract.test.ts`

Expected: FAIL because the repo currently only automates gateway image publication.

**Step 3: Implement the minimal release-parity slice**

Add:
- `docker:control-plane:build` to `package.json`
- a GHCR publish workflow for `ghcr.io/<owner>/geohelper-control-plane`
- doc updates so staging/production topology references explicit web + gateway + control-plane images

Keep:
- gateway and control-plane image automation independent
- no worker image automation yet unless the plan later proves it is needed

**Step 4: Re-run the test and doc checks**

Run:
- `pnpm test -- tests/workspace/control-plane-image-contract.test.ts`
- `pnpm exec eslint .github/workflows`

Expected: PASS

**Step 5: Commit**

Run:
- `git add package.json .github/workflows/control-plane-image.yml apps/control-plane/Dockerfile README.md docs/deploy/edgeone.md docs/BETA_CHECKLIST.md tests/workspace/control-plane-image-contract.test.ts`
- `git commit -m "feat: add control-plane release parity"`

## Task 2: Promote control-plane health and readiness into ops artifacts and thresholds

**Files:**
- Modify: `scripts/smoke/gateway-runtime.mjs`
- Modify: `scripts/ops/run-gateway-ops-checks.mjs`
- Modify: `scripts/ops/lib/evaluate-thresholds.mjs`
- Modify: `scripts/ops/run-scheduled-gateway-verify.mjs`
- Modify: `tests/workspace/gateway-runtime-vision-smoke.test.ts`
- Modify: `tests/workspace/gateway-ops-runner.test.ts`
- Modify: `docs/api/m0-m1-contract.md`
- Modify: `docs/BETA_CHECKLIST.md`

**Step 1: Write the failing tests**

Extend existing tests so they assert:
- smoke JSON includes `GET /api/v3/health` and `GET /api/v3/ready`
- ops summary exposes control-plane probe outcomes, not just gateway outcomes
- threshold evaluation fails when control-plane readiness is red even if gateway is green

**Step 2: Run the failing tests**

Run:
- `pnpm test -- tests/workspace/gateway-runtime-vision-smoke.test.ts tests/workspace/gateway-ops-runner.test.ts`

Expected: FAIL because current ops summaries still treat the control-plane checks as internal smoke details instead of first-class release gates.

**Step 3: Implement the minimal ops closure**

Update:
- smoke payload shape to keep explicit control-plane probe records
- ops summary generation to surface those records in `summary.json`
- threshold evaluation so control-plane readiness failure is a release blocker

**Step 4: Re-run verification**

Run:
- `pnpm test -- tests/workspace/gateway-runtime-vision-smoke.test.ts tests/workspace/gateway-ops-runner.test.ts`
- `pnpm exec eslint scripts/ops scripts/smoke tests/workspace`

Expected: PASS

**Step 5: Commit**

Run:
- `git add scripts/smoke/gateway-runtime.mjs scripts/ops/run-gateway-ops-checks.mjs scripts/ops/lib/evaluate-thresholds.mjs scripts/ops/run-scheduled-gateway-verify.mjs tests/workspace/gateway-runtime-vision-smoke.test.ts tests/workspace/gateway-ops-runner.test.ts docs/api/m0-m1-contract.md docs/BETA_CHECKLIST.md`
- `git commit -m "feat: promote control-plane readiness into ops gates"`

## Task 3: Converge the workspace shell to the intended left-GeoGebra / right-chat layout

**Files:**
- Modify: `apps/web/src/components/WorkspaceShell.tsx`
- Modify: `apps/web/src/components/workspace-shell/WorkspaceDesktopLayout.tsx`
- Modify: `apps/web/src/components/workspace-shell/WorkspaceCompactLayout.tsx`
- Modify: `apps/web/src/components/workspace-shell/layout-props.ts`
- Modify: `apps/web/src/components/workspace-shell/history-layout.ts`
- Modify: `apps/web/src/styles/workspace-shell.css`
- Modify: `apps/web/src/styles/workspace-shell-studio.css`
- Create: `apps/web/src/components/workspace-shell/WorkspaceDesktopLayout.test.tsx`
- Test: `apps/web/src/components/workspace-shell/history-layout.test.ts`

**Step 1: Write the failing layout tests**

Cover:
- desktop renders a persistent left canvas / right conversation shell split
- history drawer does not displace the canvas into a third competing column
- compact/mobile still degrade cleanly into the existing sheet/stack behavior

**Step 2: Run the failing tests**

Run:
- `pnpm test -- apps/web/src/components/workspace-shell/history-layout.test.ts apps/web/src/components/workspace-shell/WorkspaceDesktopLayout.test.tsx`

Expected: FAIL because the current shell still mixes history, chat, and canvas responsibilities in ways that do not enforce the target layout.

**Step 3: Implement the minimal shell convergence**

Update:
- desktop layout to make canvas the stable left surface
- chat shell the stable right surface
- history surface a secondary overlay/drawer instead of a primary competing panel

Do not:
- redesign compact/mobile from scratch
- add unrelated styling experiments

**Step 4: Re-run focused frontend verification**

Run:
- `pnpm test -- apps/web/src/components/workspace-shell/history-layout.test.ts apps/web/src/components/workspace-shell/WorkspaceDesktopLayout.test.tsx`
- `pnpm exec eslint apps/web/src/components/workspace-shell apps/web/src/styles`
- `pnpm exec tsc -p apps/web/tsconfig.json --noEmit`

Expected: PASS

**Step 5: Commit**

Run:
- `git add apps/web/src/components/WorkspaceShell.tsx apps/web/src/components/workspace-shell/WorkspaceDesktopLayout.tsx apps/web/src/components/workspace-shell/WorkspaceCompactLayout.tsx apps/web/src/components/workspace-shell/layout-props.ts apps/web/src/components/workspace-shell/history-layout.ts apps/web/src/components/workspace-shell/WorkspaceDesktopLayout.test.tsx apps/web/src/components/workspace-shell/history-layout.test.ts apps/web/src/styles/workspace-shell.css apps/web/src/styles/workspace-shell-studio.css`
- `git commit -m "feat: converge workspace shell layout"`

## Task 4: Rehearse an agent extraction path that OpenClaw can actually consume

**Files:**
- Modify: `scripts/agents/export-openclaw-bundle.mjs`
- Modify: `packages/agent-export-openclaw/src/export-report.ts`
- Modify: `packages/agent-export-openclaw/src/openclaw-smoke.ts`
- Modify: `packages/agent-export-openclaw/test/export-openclaw-bundle.test.ts`
- Modify: `apps/control-plane/src/routes/admin-bundles.ts`
- Modify: `apps/control-plane/test/admin-bundles-route.test.ts`
- Modify: `docs/BETA_CHECKLIST.md`
- Modify: `docs/deploy/edgeone.md`

**Step 1: Write the failing tests**

Cover:
- export report marks one selected bundle as a rehearsed extraction candidate
- `verifyImport` output is visible from the admin bundle audit surface
- smoke output shows the exact host-bound capabilities still preventing a clean external move

**Step 2: Run the failing tests**

Run:
- `pnpm --filter @geohelper/agent-export-openclaw test -- test/export-openclaw-bundle.test.ts`
- `pnpm --filter @geohelper/control-plane test -- test/admin-bundles-route.test.ts`

Expected: FAIL because the current flow proves portability broadly but does not yet create an operator-grade extraction rehearsal contract.

**Step 3: Implement the minimal extraction rehearsal**

Add:
- one explicit extraction candidate field in the export/openclaw reporting path
- admin bundle output that shows import verification plus extraction blockers in one place
- release-checklist language that requires at least one rehearsed extraction candidate before calling the platform portable

**Step 4: Re-run verification**

Run:
- `pnpm --filter @geohelper/agent-export-openclaw test -- test/export-openclaw-bundle.test.ts`
- `pnpm --filter @geohelper/control-plane test -- test/admin-bundles-route.test.ts`
- `pnpm exec eslint packages/agent-export-openclaw apps/control-plane`

Expected: PASS

**Step 5: Commit**

Run:
- `git add scripts/agents/export-openclaw-bundle.mjs packages/agent-export-openclaw/src/export-report.ts packages/agent-export-openclaw/src/openclaw-smoke.ts packages/agent-export-openclaw/test/export-openclaw-bundle.test.ts apps/control-plane/src/routes/admin-bundles.ts apps/control-plane/test/admin-bundles-route.test.ts docs/BETA_CHECKLIST.md docs/deploy/edgeone.md`
- `git commit -m "feat: add openclaw extraction rehearsal gate"`

## Task 5: Final verification pass and plan index update

**Files:**
- Modify: `docs/plans/README.md`

**Step 1: Run focused cross-stack verification**

Run:
- `pnpm test -- tests/gateway-runtime-smoke.test.ts tests/workspace/gateway-runtime-vision-smoke.test.ts tests/workspace/gateway-ops-runner.test.ts tests/workspace/benchmark-runner.test.ts`
- `pnpm --filter @geohelper/control-plane test`
- `pnpm --filter @geohelper/web test`
- `pnpm typecheck`

**Step 2: Run lint**

Run:
- `pnpm exec eslint apps/web apps/control-plane scripts tests packages/agent-export-openclaw`

Expected: PASS

**Step 3: Update plan index**

Add this plan to `docs/plans/README.md` and move the active execution track from the 2026-04-08 cutover docs to this closure plan once execution begins.

**Step 4: Commit**

Run:
- `git add docs/plans/README.md docs/plans/2026-04-09-post-cutover-closure-implementation-plan.md`
- `git commit -m "docs: add post-cutover closure plan"`
