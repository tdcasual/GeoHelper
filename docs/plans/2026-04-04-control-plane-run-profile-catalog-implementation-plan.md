# Control Plane Run Profile Catalog Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the control plane the authoritative registry for platform run profiles and start new runs by `profileId` instead of client-supplied `agentId/workflowId/budget`.

**Architecture:** Add a shared run-profile schema to the platform protocol, register a small control-plane catalog for the current geometry profiles, expose it through `/api/v3/run-profiles`, and change the active web runtime plus internal smoke/benchmark scripts to launch runs with `profileId`.

**Tech Stack:** TypeScript, Fastify, Vitest, Node.js shell scripts

---

### Task 1: Write Failing Contract Tests

**Files:**
- Modify: `packages/agent-protocol/test/platform-protocol.test.ts`
- Modify: `apps/control-plane/test/runs-route.test.ts`
- Modify: `apps/web/src/runtime/platform-runner.test.ts`

**Step 1: Add a failing protocol schema test**

Assert that the platform protocol accepts a minimal run-profile document with `id`, `agentId`, `workflowId`, and `defaultBudget`.

**Step 2: Add failing control-plane route tests**

Cover:
- `GET /api/v3/run-profiles`
- `POST /api/v3/threads/:threadId/runs` with `profileId`
- rejection of unknown `profileId`

**Step 3: Add a failing web runner test**

Assert that `submitPromptToPlatform()` posts only `profileId` plus `inputArtifactIds` to the control plane start-run route.

**Step 4: Run targeted tests to verify failure**

Run:

```bash
pnpm test -- packages/agent-protocol/test/platform-protocol.test.ts apps/control-plane/test/runs-route.test.ts apps/web/src/runtime/platform-runner.test.ts
```

### Task 2: Add Shared Run Profile Schema

**Files:**
- Create: `packages/agent-protocol/src/platform-run-profile.ts`
- Modify: `packages/agent-protocol/src/index.ts`

**Step 1: Define the shared schema**

Export `PlatformRunProfileSchema` and its inferred type.

**Step 2: Re-run protocol tests**

Run:

```bash
pnpm test -- packages/agent-protocol/test/platform-protocol.test.ts
```

### Task 3: Make Control Plane Authoritative

**Files:**
- Create: `apps/control-plane/src/platform-run-profiles.ts`
- Create: `apps/control-plane/src/routes/run-profiles.ts`
- Modify: `apps/control-plane/src/control-plane-context.ts`
- Modify: `apps/control-plane/src/routes/runs.ts`
- Modify: `apps/control-plane/src/server.ts`

**Step 1: Register the current built-in profiles**

Define at least the standard and quick-draft geometry profiles in the control plane registry.

**Step 2: Expose the catalog**

Return the registered profile list from `/api/v3/run-profiles`.

**Step 3: Resolve `profileId` when creating runs**

Look up the profile, derive `agentId/workflowId/budget`, and reject unknown ids.

### Task 4: Switch Active Clients And Internal Scripts

**Files:**
- Modify: `apps/web/src/runtime/control-plane-client.ts`
- Modify: `apps/web/src/runtime/platform-runner.ts`
- Modify: `scripts/bench/run-quality-benchmark.mjs`
- Modify: `scripts/smoke/gateway-runtime.mjs`
- Modify: `scripts/smoke/live-model-chain.sh`
- Modify: `tests/workspace/benchmark-runner.test.ts`
- Modify: `tests/workspace/gateway-runtime-vision-smoke.test.ts`

**Step 1: Change the web runtime request body**

Post `profileId` instead of explicit runtime internals.

**Step 2: Update benchmark and smoke callers**

Keep all internal platform callers aligned with the new API contract.

### Task 5: Verify And Commit

**Files:**
- Modify: `docs/api/m0-m1-contract.md`

**Step 1: Update the API contract docs**

Document `/api/v3/run-profiles` and the new `profileId` start-run payload.

**Step 2: Run repo verification**

Run:

```bash
pnpm verify:architecture
pnpm test:e2e
```
