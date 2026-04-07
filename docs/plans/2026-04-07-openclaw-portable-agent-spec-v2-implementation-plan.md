# OpenClaw-Portable Agent Spec V2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild GeoHelper's agent definition and registration flow around a portable, file-backed agent bundle format that can later be exported into an OpenClaw-friendly agent workspace.

**Architecture:** Introduce a new bundle contract layer that owns portable agent manifests, workspace bootstrap files, tool/evaluator manifests, and export metadata. Keep the existing `control-plane + worker + store` runtime, but treat it as a host adapter that loads and binds bundles instead of owning the agent definition. Convert the geometry agent into the first bundle-backed domain and add an OpenClaw exporter that emits a compatibility report.

**Tech Stack:** TypeScript, Node.js, Zod, Fastify, Vitest, existing GeoHelper packages

---

### Task 1: Add the portable bundle package

**Files:**
- Create: `packages/agent-bundle/package.json`
- Create: `packages/agent-bundle/src/index.ts`
- Create: `packages/agent-bundle/src/bundle-schema.ts`
- Create: `packages/agent-bundle/src/bundle-loader.ts`
- Create: `packages/agent-bundle/src/fs-loader.ts`
- Test: `packages/agent-bundle/test/bundle-loader.test.ts`

**Step 1: Write failing tests**

Cover:
- loading a bundle from a directory
- validating `agent.json`
- resolving relative files
- surfacing missing required files

**Step 2: Run the new package test**

Run: `pnpm --filter @geohelper/agent-bundle test -- test/bundle-loader.test.ts`

**Step 3: Implement schema + loader**

Add:
- bundle manifest schema
- tool/evaluator/policy manifest schemas
- a filesystem-backed loader returning a normalized bundle object

**Step 4: Run the package test again**

Run: `pnpm --filter @geohelper/agent-bundle test -- test/bundle-loader.test.ts`

**Step 5: Commit**

Commit message: `feat: add portable agent bundle loader`

### Task 2: Create the geometry bundle assets

**Files:**
- Create: `agents/geometry-solver/agent.json`
- Create: `agents/geometry-solver/workspace/AGENTS.md`
- Create: `agents/geometry-solver/workspace/IDENTITY.md`
- Create: `agents/geometry-solver/workspace/USER.md`
- Create: `agents/geometry-solver/workspace/TOOLS.md`
- Create: `agents/geometry-solver/workspace/MEMORY.md`
- Create: `agents/geometry-solver/workspace/STANDING_ORDERS.md`
- Create: `agents/geometry-solver/prompts/planner.md`
- Create: `agents/geometry-solver/prompts/executor.md`
- Create: `agents/geometry-solver/prompts/synthesizer.md`
- Create: `agents/geometry-solver/prompts/evaluator-teacher-readiness.md`
- Create: `agents/geometry-solver/tools/scene.read_state.tool.json`
- Create: `agents/geometry-solver/tools/scene.apply_command_batch.tool.json`
- Create: `agents/geometry-solver/evaluators/teacher_readiness.eval.json`
- Create: `agents/geometry-solver/policies/context-policy.json`
- Create: `agents/geometry-solver/policies/memory-policy.json`
- Create: `agents/geometry-solver/policies/approval-policy.json`
- Create: `agents/geometry-solver/artifacts/output-contract.json`
- Create: `agents/geometry-solver/delegations/subagents.json`

**Step 1: Write the bundle assets to match the V2 design**

Keep them portable and avoid GeoHelper runtime leakage beyond explicit `hostRequirements`.

**Step 2: Add a fixture-driven test if needed**

Verify the loader can read the real geometry bundle.

**Step 3: Run the bundle package tests**

Run: `pnpm --filter @geohelper/agent-bundle test`

**Step 4: Commit**

Commit message: `feat: add geometry portable agent bundle`

### Task 3: Add bundle-backed host registration

**Files:**
- Modify: `packages/agent-sdk/src/index.ts`
- Create: `packages/agent-sdk/src/bundle-registry.ts`
- Create: `packages/agent-sdk/src/load-domain-bundle.ts`
- Modify: `packages/agent-domain-geometry/src/platform-bootstrap.ts`
- Modify: `packages/agent-domain-geometry/src/index.ts`
- Test: `packages/agent-domain-geometry/test/platform-bootstrap.test.ts`

**Step 1: Write failing tests**

Cover:
- geometry platform bootstrap resolves from bundle assets
- tool/evaluator names still resolve into runtime bootstrap

**Step 2: Run the failing tests**

Run: `pnpm --filter @geohelper/agent-domain-geometry test -- test/platform-bootstrap.test.ts`

**Step 3: Implement bundle-to-runtime mapping**

Build:
- bundle loader integration
- runtime bootstrap generation from bundle manifest + host bindings

**Step 4: Re-run tests**

Run: `pnpm --filter @geohelper/agent-domain-geometry test -- test/platform-bootstrap.test.ts`

**Step 5: Commit**

Commit message: `feat: load geometry runtime from portable bundle`

### Task 4: Cut worker and control-plane over to bundle-backed bootstrap

**Files:**
- Modify: `apps/worker/src/worker.ts`
- Modify: `apps/control-plane/src/control-plane-context.ts`
- Modify: `packages/agent-protocol/src/platform-agent.ts`
- Modify: `packages/agent-protocol/src/index.ts`
- Add or modify tests covering runtime creation

**Step 1: Write failing tests**

Cover:
- runtime creation still exposes geometry profiles and tools
- bundle metadata is available from the runtime

**Step 2: Run the targeted runtime tests**

Run:
- `pnpm --filter @geohelper/worker test -- test/worker.test.ts test/run-loop.test.ts test/run-loop-subagent.test.ts`
- `pnpm --filter @geohelper/control-plane test -- test/control-plane-context.test.ts`

**Step 3: Implement runtime cutover**

Make bundle-backed bootstrap the authoritative path while preserving current run semantics.

**Step 4: Re-run targeted runtime tests**

Use the same commands as Step 2.

**Step 5: Commit**

Commit message: `feat: cut runtime over to bundle-backed agents`

### Task 5: Add the OpenClaw exporter

**Files:**
- Create: `packages/agent-export-openclaw/package.json`
- Create: `packages/agent-export-openclaw/src/index.ts`
- Create: `packages/agent-export-openclaw/src/export-openclaw-bundle.ts`
- Create: `packages/agent-export-openclaw/src/export-report.ts`
- Test: `packages/agent-export-openclaw/test/export-openclaw-bundle.test.ts`

**Step 1: Write failing tests**

Cover:
- exporting the geometry bundle into an OpenClaw-friendly directory shape
- generating a compatibility report
- reporting host-bound capabilities

**Step 2: Run the new exporter tests**

Run: `pnpm --filter @geohelper/agent-export-openclaw test -- test/export-openclaw-bundle.test.ts`

**Step 3: Implement the exporter**

Emit:
- normalized bundle export
- OpenClaw workspace files
- compatibility report JSON

**Step 4: Re-run exporter tests**

Run: `pnpm --filter @geohelper/agent-export-openclaw test -- test/export-openclaw-bundle.test.ts`

**Step 5: Commit**

Commit message: `feat: add openclaw bundle exporter`

### Task 6: Verify the whole migration

**Files:**
- Modify: `docs/plans/README.md`
- Optionally add small docs references where useful

**Step 1: Run focused package tests**

Run:
- `pnpm --filter @geohelper/agent-bundle test`
- `pnpm --filter @geohelper/agent-domain-geometry test`
- `pnpm --filter @geohelper/agent-export-openclaw test`
- `pnpm --filter @geohelper/worker test -- test/worker.test.ts test/run-loop.test.ts test/run-loop-subagent.test.ts`
- `pnpm --filter @geohelper/control-plane test -- test/control-plane-context.test.ts test/platform-catalog-route.test.ts`

**Step 2: Run cross-repo verification**

Run:
- `pnpm typecheck`
- `pnpm exec eslint packages/agent-bundle packages/agent-sdk packages/agent-domain-geometry packages/agent-export-openclaw apps/worker/src/worker.ts apps/control-plane/src/control-plane-context.ts`

**Step 3: Update plans index if needed**

Add the new design and implementation docs to the plans index.

**Step 4: Commit**

Commit message: `docs: index portable agent v2 rollout`
