# OpenClaw-Portable Agent Phase 2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn the new portable bundle architecture from a registration/export layer into the actual execution source of truth for context assembly, prompt driving, tool binding, delegation, and host interoperability.

**Architecture:** Keep the bundle schema, geometry bundle assets, and OpenClaw exporter that now exist, but make the runtime consume them end-to-end. Phase 2 shifts the center of gravity from “portable bundle metadata” to “portable bundle execution” by wiring workspace bootstrap files, policies, prompts, capability bindings, and delegation contracts into the context plane, intelligence plane, tool plane, and control-plane ops surface.

**Tech Stack:** TypeScript, Node.js, Fastify, Zod, Vitest, existing GeoHelper packages, current control-plane + worker runtime

---

## Why Phase 2 Is Next

Phase 1 solved these problems:

1. portable bundle schema exists
2. geometry agent is file-backed
3. runtime bootstrap is portable
4. OpenClaw export path exists

What is still missing:

1. bundle workspace files do not yet drive context assembly
2. prompt assets do not yet drive planner/model/synthesizer behavior
3. host capability binding is still mostly implicit
4. tool manifests are not yet the authoritative runtime binding contract
5. delegation manifests are not executed by runtime
6. exporter is library-only, not a real operational workflow

That makes Phase 2 the point where portability starts to affect real execution quality, not just registration shape.

## Phase 2 Priorities

Priority order:

1. Bundle-aware context engine
2. Host capability binding and manifest-driven tool binding
3. Bundle-driven intelligence drivers
4. Delegation V2 with native + ACP modes
5. Export operationalization
6. Portability proof via a second portable agent

## Task 1: Make the context plane bundle-aware

**Outcome:** `ContextPacket` is assembled from bundle workspace files and policies, not just store-backed records.

**Files:**
- Modify: `packages/agent-context/src/context-types.ts`
- Modify: `packages/agent-context/src/context-assembler.ts`
- Modify: `packages/agent-context/src/store-backed-context-assembler.ts`
- Create: `packages/agent-context/src/portable-context-assembler.ts`
- Modify: `apps/worker/src/run-loop.ts`
- Test: `packages/agent-context/test/context-assembler.test.ts`

**Step 1: Write failing tests**

Cover:
- bundle workspace bootstrap files flow into `system` and `instructions`
- bundle context policy limits what memories and artifacts are included
- prompt assets are visible to downstream drivers

**Step 2: Run the failing tests**

Run: `pnpm --filter @geohelper/agent-context test -- test/context-assembler.test.ts`

**Step 3: Implement bundle-aware context assembly**

Add:
- bundle metadata input into context assembler
- workspace bootstrap composition rules
- policy-aware memory/artifact filtering

**Step 4: Wire the worker run loop to use the new assembler**

Ensure runtime context can hand the active bundle into context assembly.

**Step 5: Re-run tests**

Run:
- `pnpm --filter @geohelper/agent-context test -- test/context-assembler.test.ts`
- `pnpm --filter @geohelper/worker test -- test/run-loop.test.ts`

**Step 6: Commit**

Commit message: `feat: make context assembly bundle-aware`

## Task 2: Introduce explicit host capability binding

**Outcome:** runtime tools are bound by declared host capability instead of domain-local branching.

**Files:**
- Create: `packages/agent-sdk/src/host-capability-binding.ts`
- Create: `packages/agent-host-geohelper/package.json`
- Create: `packages/agent-host-geohelper/src/index.ts`
- Create: `packages/agent-host-geohelper/src/geometry-host-bindings.ts`
- Modify: `packages/agent-domain-geometry/src/platform-bootstrap.ts`
- Modify: `apps/worker/src/worker.ts`
- Modify: `apps/control-plane/src/control-plane-context.ts`
- Test: `packages/agent-domain-geometry/test/host-capability-binding.test.ts`

**Step 1: Write failing tests**

Cover:
- manifest tool binding resolves by `hostCapability`
- missing host capability fails with a readable runtime error
- geometry no longer hardcodes tool manifest dispatch in `platform-bootstrap`

**Step 2: Run the failing tests**

Run: `pnpm --filter @geohelper/agent-domain-geometry test -- test/host-capability-binding.test.ts`

**Step 3: Implement host binding registry**

Support:
- capability key to runtime tool factory binding
- explicit GeoHelper host package for geometry scene capabilities

**Step 4: Cut geometry bootstrap over**

Replace current `if manifest.name === ...` branching with binding registry lookup.

**Step 5: Re-run tests**

Run:
- `pnpm --filter @geohelper/agent-domain-geometry test`
- `pnpm --filter @geohelper/worker test -- test/worker.test.ts`

**Step 6: Commit**

Commit message: `feat: add host capability binding layer`

## Task 3: Make planner/model/synthesizer drivers use bundle prompt assets

**Outcome:** bundle prompt files become the real intelligence inputs.

**Files:**
- Modify: `packages/agent-intelligence/src/node-drivers/planner-driver.ts`
- Modify: `packages/agent-intelligence/src/node-drivers/model-driver.ts`
- Modify: `packages/agent-intelligence/src/node-drivers/synthesizer-driver.ts`
- Modify: `packages/agent-intelligence/src/node-drivers/types.ts`
- Create: `packages/agent-intelligence/src/prompt-composer.ts`
- Add or modify tests in `packages/agent-intelligence/test/*`

**Step 1: Write failing tests**

Cover:
- planner driver reads `prompts/planner.md`
- synthesizer driver reads `prompts/synthesizer.md`
- missing prompt assets fail deterministically

**Step 2: Run the failing tests**

Run: `pnpm --filter @geohelper/agent-intelligence test`

**Step 3: Implement prompt composition**

Build:
- prompt asset lookup from bundle metadata
- context + prompt template composition
- normalized driver input surface for future model provider work

**Step 4: Re-run tests**

Run:
- `pnpm --filter @geohelper/agent-intelligence test`
- `pnpm --filter @geohelper/worker test -- test/run-loop.test.ts`

**Step 5: Commit**

Commit message: `feat: drive intelligence nodes from bundle prompts`

## Task 4: Implement Delegation V2

**Outcome:** delegation manifests drive runtime behavior, and `native-subagent` vs `acp-agent` become first-class runtime modes.

**Files:**
- Modify: `packages/agent-bundle/src/bundle-schema.ts`
- Modify: `apps/worker/src/run-loop.ts`
- Modify: `packages/agent-core/src/engine/node-runner.ts`
- Modify: `packages/agent-core/src/engine/workflow-engine.ts`
- Create: `packages/agent-sdk/src/delegation-resolver.ts`
- Test: `apps/worker/test/run-loop-subagent.test.ts`

**Step 1: Write failing tests**

Cover:
- `native-subagent` creates child runs
- `acp-agent` resolves into a distinct external delegation mode
- missing delegation config fails clearly

**Step 2: Run the failing tests**

Run: `pnpm --filter @geohelper/worker test -- test/run-loop-subagent.test.ts`

**Step 3: Implement delegation resolver**

Support:
- name-based delegation lookup
- mode-aware runtime dispatch
- current child-run semantics for native delegations
- placeholder ACP dispatch contract for future external harness integration

**Step 4: Re-run tests**

Run:
- `pnpm --filter @geohelper/worker test -- test/run-loop-subagent.test.ts`
- `pnpm --filter @geohelper/agent-core test`

**Step 5: Commit**

Commit message: `feat: add delegation v2 runtime modes`

## Task 5: Operationalize the OpenClaw exporter

**Outcome:** export is no longer just a library helper; it becomes a supported control-plane or scripts workflow.

**Files:**
- Modify: `packages/agent-export-openclaw/src/export-openclaw-bundle.ts`
- Create: `scripts/agents/export-openclaw-bundle.mjs`
- Optional: `apps/control-plane/src/routes/admin-bundles.ts`
- Optional tests for script or route

**Step 1: Write failing tests**

Cover:
- exporting a named bundle from repo root
- emitting `export-report.json`
- preserving workspace bootstrap assets

**Step 2: Run the failing tests**

Run: `pnpm --filter @geohelper/agent-export-openclaw test`

**Step 3: Implement script and/or route**

Recommended minimum:
- script entrypoint for `agents/<id>` export
- deterministic output directory and report output

Optional enhancement:
- admin route to trigger or inspect exports

**Step 4: Re-run tests**

Run:
- `pnpm --filter @geohelper/agent-export-openclaw test`
- invoke the export script against `geometry-solver`

**Step 5: Commit**

Commit message: `feat: operationalize openclaw bundle export`

## Task 6: Prove portability with a second portable agent

**Outcome:** the system proves it is not geometry-singleton architecture anymore.

**Files:**
- Create: `agents/geometry-reviewer/*`
- Modify: relevant domain package or add `packages/agent-domain-geometry-review`
- Tests across bundle loader, platform catalog, and export path

**Step 1: Write failing tests**

Cover:
- repo can load more than one portable agent
- platform catalog exposes multiple agents/run profiles
- exporter handles both agents

**Step 2: Run the failing tests**

Run:
- `pnpm --filter @geohelper/agent-bundle test`
- `pnpm --filter @geohelper/control-plane test -- test/platform-catalog-route.test.ts`

**Step 3: Implement the second agent**

Recommended candidate:
- `geometry-reviewer`
  - focus on reviewability, pedagogy, and corrective guidance

**Step 4: Re-run tests**

Run:
- `pnpm --filter @geohelper/agent-bundle test`
- `pnpm --filter @geohelper/control-plane test`
- `pnpm --filter @geohelper/agent-export-openclaw test`

**Step 5: Commit**

Commit message: `feat: add second portable agent`

## Task 7: Full verification pass

**Files:**
- Modify: `docs/plans/README.md`
- Add any follow-up docs discovered during implementation

**Step 1: Run focused suite**

Run:
- `pnpm --filter @geohelper/agent-context test`
- `pnpm --filter @geohelper/agent-intelligence test`
- `pnpm --filter @geohelper/agent-domain-geometry test`
- `pnpm --filter @geohelper/agent-bundle test`
- `pnpm --filter @geohelper/agent-export-openclaw test`
- `pnpm --filter @geohelper/worker test -- test/worker.test.ts test/run-loop.test.ts test/run-loop-subagent.test.ts`
- `pnpm --filter @geohelper/control-plane test -- test/control-plane-context.test.ts test/platform-catalog-route.test.ts`

**Step 2: Run cross-repo verification**

Run:
- `pnpm typecheck`
- `pnpm exec eslint packages/agent-context packages/agent-intelligence packages/agent-sdk packages/agent-bundle packages/agent-domain-geometry packages/agent-export-openclaw apps/worker apps/control-plane`

**Step 3: Update plan index**

Add this Phase 2 plan to `docs/plans/README.md`.

**Step 4: Commit**

Commit message: `docs: index portable agent phase 2 plan`

## Recommended Execution Order

If we continue immediately, the best order is:

1. Task 1: bundle-aware context engine
2. Task 2: host capability binding
3. Task 3: bundle-driven intelligence drivers
4. Task 4: delegation v2
5. Task 5: exporter operationalization
6. Task 6: second agent portability proof
7. Task 7: full verification pass

## Notes

This phase intentionally does **not** yet require:

1. full ACP external execution integration
2. multi-tenant policy model
3. a full plugin marketplace

It does require that bundle assets stop being decorative metadata and start becoming the real runtime input surface.
