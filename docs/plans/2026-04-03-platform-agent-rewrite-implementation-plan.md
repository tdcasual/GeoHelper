# Platform Agent Rewrite Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace GeoHelper's compile-centric geometry pipeline with a platform-style agent kernel that supports durable runs, workflow graphs, tools, memory, checkpoints, subagents, and geometry as a domain package, with no backward compatibility path.

**Architecture:** Build a new `control-plane + worker + browser bridge` runtime and move all current compile behavior behind a generic run ledger. The new platform exposes first-class run, event, artifact, checkpoint, memory, and tool abstractions, then reintroduces GeoHelper as the first domain package on top of that kernel.

**Tech Stack:** TypeScript, Node.js, Fastify, React 19, Zustand, Zod, Postgres, Redis, S3/MinIO, Vitest, Playwright

---

### Task 1: Create The New Package Skeleton

**Files:**
- Create: `apps/control-plane/package.json`
- Create: `apps/worker/package.json`
- Create: `packages/browser-bridge/package.json`
- Create: `packages/agent-protocol/package.json`
- Create: `packages/agent-core/package.json`
- Create: `packages/agent-store/package.json`
- Create: `packages/agent-tools/package.json`
- Create: `packages/agent-memory/package.json`
- Create: `packages/agent-evals/package.json`
- Create: `packages/agent-domain-geometry/package.json`
- Modify: `pnpm-workspace.yaml`
- Modify: `/Users/lvxiaoer/Documents/codeWork/GeoHelper/package.json`

**Step 1: Write the failing workspace smoke test**

Create a test that imports `@geohelper/agent-protocol`, `@geohelper/agent-core`, and `@geohelper/browser-bridge` from the workspace and fails because the packages do not exist yet.

**Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/workspace/platform-agent-packages.test.ts`

**Step 3: Add minimal package manifests and tsconfig stubs**

Create the new package directories and export a trivial symbol from each package entrypoint.

**Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/workspace/platform-agent-packages.test.ts`

**Step 5: Commit**

```bash
git add pnpm-workspace.yaml package.json apps/control-plane apps/worker packages/agent-*
git commit -m "chore: scaffold platform agent packages"
```

### Task 2: Define The New Platform Protocol

**Files:**
- Create: `packages/agent-protocol/src/run.ts`
- Create: `packages/agent-protocol/src/workflow.ts`
- Create: `packages/agent-protocol/src/artifact.ts`
- Create: `packages/agent-protocol/src/checkpoint.ts`
- Create: `packages/agent-protocol/src/memory.ts`
- Create: `packages/agent-protocol/src/index.ts`
- Test: `packages/agent-protocol/test/platform-protocol.test.ts`

**Step 1: Write the failing protocol test**

Add a fixture asserting that `RunSchema`, `WorkflowNodeSchema`, `ArtifactSchema`, and `CheckpointSchema` accept a minimal run ledger document.

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @geohelper/agent-protocol test -- test/platform-protocol.test.ts`

**Step 3: Implement the Zod schemas and exports**

Model `Run`, `RunEvent`, `WorkflowDefinition`, `NodeExecution`, `Artifact`, `Checkpoint`, and `MemoryEntry`.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @geohelper/agent-protocol test -- test/platform-protocol.test.ts`

**Step 5: Commit**

```bash
git add packages/agent-protocol
git commit -m "feat: define platform agent protocol"
```

### Task 3: Build The Durable Run Store

**Files:**
- Create: `packages/agent-store/src/repos/run-repo.ts`
- Create: `packages/agent-store/src/repos/event-repo.ts`
- Create: `packages/agent-store/src/repos/checkpoint-repo.ts`
- Create: `packages/agent-store/src/repos/artifact-repo.ts`
- Create: `packages/agent-store/src/repos/memory-repo.ts`
- Create: `packages/agent-store/src/schema.sql`
- Create: `packages/agent-store/src/index.ts`
- Test: `packages/agent-store/test/run-store.test.ts`

**Step 1: Write the failing repository test**

Cover `createRun`, `appendRunEvent`, `listCheckpointsByStatus`, and `loadRunSnapshot`.

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @geohelper/agent-store test -- test/run-store.test.ts`

**Step 3: Implement repositories against a local Postgres test harness**

Persist immutable run events and derive snapshots from them.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @geohelper/agent-store test -- test/run-store.test.ts`

**Step 5: Commit**

```bash
git add packages/agent-store
git commit -m "feat: add durable run store"
```

### Task 4: Implement The Workflow Engine

**Files:**
- Create: `packages/agent-core/src/engine/workflow-engine.ts`
- Create: `packages/agent-core/src/engine/node-runner.ts`
- Create: `packages/agent-core/src/engine/status-machine.ts`
- Create: `packages/agent-core/src/engine/budget.ts`
- Create: `packages/agent-core/src/index.ts`
- Test: `packages/agent-core/test/workflow-engine.test.ts`

**Step 1: Write the failing engine tests**

Cover:
- sequential node execution
- router branching
- checkpoint pause/resume
- subagent spawn bookkeeping
- budget exhaustion failure

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @geohelper/agent-core test -- test/workflow-engine.test.ts`

**Step 3: Implement the minimal durable execution engine**

Make the engine consume `WorkflowDefinition`, append events, and stop on checkpoints or failures.

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter @geohelper/agent-core test -- test/workflow-engine.test.ts`

**Step 5: Commit**

```bash
git add packages/agent-core
git commit -m "feat: add workflow execution engine"
```

### Task 5: Add The Tool Registry And Sandbox Policy

**Files:**
- Create: `packages/agent-tools/src/tool-definition.ts`
- Create: `packages/agent-tools/src/tool-registry.ts`
- Create: `packages/agent-tools/src/tool-runner.ts`
- Create: `packages/agent-tools/src/tool-policy.ts`
- Create: `packages/agent-tools/src/index.ts`
- Test: `packages/agent-tools/test/tool-runner.test.ts`

**Step 1: Write the failing tool tests**

Cover:
- schema validation
- permission denial
- retry policy
- audit redaction

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @geohelper/agent-tools test -- test/tool-runner.test.ts`

**Step 3: Implement the registry and runner**

Support `server_tool`, `worker_tool`, `browser_tool`, and `external_tool`.

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter @geohelper/agent-tools test -- test/tool-runner.test.ts`

**Step 5: Commit**

```bash
git add packages/agent-tools
git commit -m "feat: add platform tool registry"
```

### Task 6: Implement The Memory Layer

**Files:**
- Create: `packages/agent-memory/src/memory-types.ts`
- Create: `packages/agent-memory/src/memory-writer.ts`
- Create: `packages/agent-memory/src/memory-retriever.ts`
- Create: `packages/agent-memory/src/memory-policy.ts`
- Create: `packages/agent-memory/src/index.ts`
- Test: `packages/agent-memory/test/memory-layer.test.ts`

**Step 1: Write the failing memory tests**

Cover:
- thread memory retrieval
- workspace memory retrieval
- write deduplication
- source artifact attribution

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @geohelper/agent-memory test -- test/memory-layer.test.ts`

**Step 3: Implement minimal memory retrieval and write policy**

Make memory writes explicit and traceable back to source artifacts.

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter @geohelper/agent-memory test -- test/memory-layer.test.ts`

**Step 5: Commit**

```bash
git add packages/agent-memory
git commit -m "feat: add agent memory layer"
```

### Task 7: Create The Geometry Domain Package

**Files:**
- Create: `packages/agent-domain-geometry/src/agents/geometry-solver.ts`
- Create: `packages/agent-domain-geometry/src/workflows/geometry-solver-workflow.ts`
- Create: `packages/agent-domain-geometry/src/tools/scene-read-state.ts`
- Create: `packages/agent-domain-geometry/src/tools/scene-apply-command-batch.ts`
- Create: `packages/agent-domain-geometry/src/evals/teacher-readiness.ts`
- Create: `packages/agent-domain-geometry/src/index.ts`
- Test: `packages/agent-domain-geometry/test/geometry-domain.test.ts`

**Step 1: Write the failing domain tests**

Cover:
- geometry agent definition registration
- workflow graph shape
- command batch artifact generation
- teacher-readiness eval output

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @geohelper/agent-domain-geometry test -- test/geometry-domain.test.ts`

**Step 3: Implement the first domain package**

Move geometry-specific planning, tool defs, and evaluators out of the platform core.

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter @geohelper/agent-domain-geometry test -- test/geometry-domain.test.ts`

**Step 5: Commit**

```bash
git add packages/agent-domain-geometry
git commit -m "feat: add geometry domain package"
```

### Task 8: Replace Gateway With The New Control Plane

**Files:**
- Create: `apps/control-plane/src/server.ts`
- Create: `apps/control-plane/src/routes/threads.ts`
- Create: `apps/control-plane/src/routes/runs.ts`
- Create: `apps/control-plane/src/routes/checkpoints.ts`
- Create: `apps/control-plane/src/routes/stream.ts`
- Create: `apps/control-plane/src/routes/browser-sessions.ts`
- Test: `apps/control-plane/test/runs-route.test.ts`
- Test: `apps/control-plane/test/checkpoints-route.test.ts`

**Step 1: Write the failing API tests**

Cover:
- create thread
- start run
- stream run events
- resolve checkpoint
- reject invalid browser tool result

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @geohelper/control-plane test -- test/runs-route.test.ts test/checkpoints-route.test.ts`

**Step 3: Implement the control-plane service**

Wire the API to the run store, scheduler, and event streaming layer.

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter @geohelper/control-plane test -- test/runs-route.test.ts test/checkpoints-route.test.ts`

**Step 5: Commit**

```bash
git add apps/control-plane
git commit -m "feat: add control plane api"
```

### Task 9: Add The Worker Process

**Files:**
- Create: `apps/worker/src/worker.ts`
- Create: `apps/worker/src/run-loop.ts`
- Create: `apps/worker/src/browser-tool-dispatch.ts`
- Create: `apps/worker/src/model-dispatch.ts`
- Test: `apps/worker/test/run-loop.test.ts`

**Step 1: Write the failing worker tests**

Cover:
- queue claim
- node execution
- checkpoint pause
- resume after browser tool completion

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @geohelper/worker test -- test/run-loop.test.ts`

**Step 3: Implement the worker main loop**

Consume queued runs, execute nodes, append events, and park on checkpoints.

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter @geohelper/worker test -- test/run-loop.test.ts`

**Step 5: Commit**

```bash
git add apps/worker
git commit -m "feat: add agent worker runtime"
```

### Task 10: Rebuild The Web App Around Threads, Runs, And Artifacts

**Files:**
- Create: `apps/web/src/state/thread-store.ts`
- Create: `apps/web/src/state/run-store.ts`
- Create: `apps/web/src/state/checkpoint-store.ts`
- Create: `apps/web/src/state/artifact-store.ts`
- Create: `apps/web/src/runtime/control-plane-client.ts`
- Create: `apps/web/src/components/RunConsole.tsx`
- Create: `apps/web/src/components/CheckpointInbox.tsx`
- Create: `apps/web/src/components/ArtifactViewer.tsx`
- Modify: `apps/web/src/components/WorkspaceShell.tsx`
- Test: `apps/web/src/state/run-store.test.ts`
- Test: `apps/web/src/components/RunConsole.test.tsx`

**Step 1: Write the failing state and UI tests**

Cover:
- run event streaming updates store state
- checkpoint resolution updates UI
- artifact viewer shows latest draft and canvas evidence

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @geohelper/web test -- src/state/run-store.test.ts src/components/RunConsole.test.tsx`

**Step 3: Implement the new client and stores**

Switch the app from compile-result state to thread/run/checkpoint/artifact state.

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter @geohelper/web test -- src/state/run-store.test.ts src/components/RunConsole.test.tsx`

**Step 5: Commit**

```bash
git add apps/web
git commit -m "feat: rebuild web app around platform runs"
```

### Task 11: Add The Browser Bridge

**Files:**
- Create: `packages/browser-bridge/src/session.ts`
- Create: `packages/browser-bridge/src/commands.ts`
- Create: `apps/web/src/runtime/browser-bridge.ts`
- Create: `apps/web/src/runtime/browser-bridge.test.ts`
- Modify: `apps/web/src/components/CanvasPanel.tsx`

**Step 1: Write the failing browser bridge tests**

Cover:
- receive browser tool request
- execute GeoGebra command batch
- post canvas evidence back to control plane

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @geohelper/web test -- src/runtime/browser-bridge.test.ts`

**Step 3: Implement the bridge session**

Make browser-side canvas interactions available as auditable `browser_tool` executions.

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter @geohelper/web test -- src/runtime/browser-bridge.test.ts`

**Step 5: Commit**

```bash
git add packages/browser-bridge apps/web/src/runtime/browser-bridge* apps/web/src/components/CanvasPanel.tsx
git commit -m "feat: add browser tool bridge"
```

### Task 12: Add Platform Observability And Admin Views

**Files:**
- Create: `apps/control-plane/src/routes/admin-runs.ts`
- Create: `apps/control-plane/src/routes/admin-tools.ts`
- Create: `apps/control-plane/src/routes/admin-memory.ts`
- Create: `apps/web/src/components/admin/RunTimelinePage.tsx`
- Test: `apps/control-plane/test/admin-runs-route.test.ts`
- Test: `apps/web/src/components/admin/RunTimelinePage.test.tsx`

**Step 1: Write the failing admin tests**

Cover:
- list runs with status filters
- inspect node timeline
- list pending checkpoints
- display memory writes for a run

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @geohelper/control-plane test -- test/admin-runs-route.test.ts`

**Step 3: Implement the admin surfaces**

Expose timeline, checkpoint, tool usage, and memory write inspection.

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter @geohelper/control-plane test -- test/admin-runs-route.test.ts`

**Step 5: Commit**

```bash
git add apps/control-plane/src/routes/admin-* apps/web/src/components/admin
git commit -m "feat: add platform observability views"
```

### Task 13: Delete The Legacy Compile Stack

**Files:**
- Delete: `apps/gateway/src/routes/agent-runs.ts`
- Delete: `apps/web/src/runtime/direct-client.ts`
- Delete: `apps/web/src/runtime/gateway-client.ts`
- Delete: `apps/web/src/runtime/orchestrator.ts`
- Delete: `apps/web/src/state/agent-run-store.ts`
- Delete: `packages/protocol/src/agent-run.ts`
- Modify: `README.md`
- Modify: `docs/api/m0-m1-contract.md`
- Test: `tests/workspace/live-model-chain.test.ts`

**Step 1: Write the failing cleanup assertions**

Update tests so the workspace explicitly fails if legacy compile routes or runtime clients remain referenced.

**Step 2: Run tests to verify they fail**

Run: `pnpm test -- tests/workspace/live-model-chain.test.ts`

**Step 3: Remove the legacy code and update docs**

Delete compile-centric modules and rewrite top-level docs around the new run platform.

**Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/workspace/live-model-chain.test.ts`

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: remove legacy compile stack"
```

### Task 14: Full Verification And Release Cutover

**Files:**
- Modify: `README.md`
- Modify: `docs/BETA_CHECKLIST.md`
- Modify: `docs/plans/README.md`
- Test: `tests/e2e/platform-run-console.spec.ts`
- Test: `tests/workspace/architecture-budgets.test.ts`

**Step 1: Write the final end-to-end test**

Cover:
- start geometry run
- receive a checkpoint
- resolve checkpoint
- apply command batch to canvas
- inspect run timeline and artifacts

**Step 2: Run tests to verify they fail**

Run: `pnpm test:e2e -- --grep "platform run console"`

**Step 3: Wire the last integration gaps and update docs**

Finalize product docs, release checklist, and architecture budgets for the new package layout.

**Step 4: Run the full verification suite**

Run:
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:e2e`
- `pnpm verify:architecture`

**Step 5: Commit**

```bash
git add -A
git commit -m "release: cut over to platform agent architecture"
```
