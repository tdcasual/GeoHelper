# GeoHelper Agent VNext Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current chain-style compile agent with a new artifact-centric `AgentRun` workflow inspired by `manim-generator`, so GeoHelper returns reviewable geometry work packages instead of bare command batches.

**Architecture:** Introduce a shared `AgentRunEnvelope` protocol carrying draft, review, evidence, and teacher packet data. Implement a gateway-first author/reviewer/reviser/preflight workflow, then cut the web app over to a first-class `AgentRun` state model and add explicit browser-side canvas evidence repair loops.

**Tech Stack:** TypeScript, Zod, Fastify, React 19, Zustand, Vitest, Playwright, GeoGebra runtime

---

### Task 1: Define The `AgentRun` Protocol

**Files:**
- Create: `packages/protocol/src/agent-run.ts`
- Modify: `packages/protocol/src/index.ts`
- Test: `packages/protocol/test/agent-run.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { AgentRunEnvelopeSchema } from "../src/agent-run";

describe("AgentRunEnvelopeSchema", () => {
  it("accepts reviewable geometry agent runs", () => {
    expect(() =>
      AgentRunEnvelopeSchema.parse({
        run: {
          id: "run_1",
          target: "gateway",
          mode: "official",
          status: "success",
          iterationCount: 1,
          startedAt: "2026-03-17T10:00:00.000Z",
          finishedAt: "2026-03-17T10:00:01.000Z",
          totalDurationMs: 1000
        },
        draft: {
          normalizedIntent: "构造三角形外接圆",
          assumptions: ["已知三角形 ABC"],
          constructionPlan: ["先构造边", "再求垂直平分线"],
          namingPlan: ["A", "B", "C", "O"],
          commandBatchDraft: {
            commands: [],
            explanations: ["已生成草案"],
            post_checks: []
          },
          teachingOutline: ["先画三角形", "再说明圆心"],
          reviewChecklist: ["检查圆心是否为垂直平分线交点"]
        },
        reviews: [],
        evidence: {
          preflight: {
            status: "passed",
            issues: [],
            referencedLabels: ["A", "B", "C", "O"],
            generatedLabels: ["A", "B", "C", "O"]
          }
        },
        teacherPacket: {
          summary: ["已构造三角形外接圆草案"],
          warnings: [],
          uncertainties: [],
          nextActions: ["检查圆心位置"],
          canvasLinks: []
        },
        telemetry: {
          upstreamCallCount: 2,
          degraded: false,
          stages: []
        }
      })
    ).not.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @geohelper/protocol test -- test/agent-run.test.ts`  
Expected: FAIL with `Cannot find module '../src/agent-run'` or missing export errors

**Step 3: Write minimal implementation**

```ts
import { z } from "zod";

import { CommandBatchSchema } from "./schema";

export const AgentRunEnvelopeSchema = z.object({
  run: z.object({
    id: z.string().min(1),
    target: z.enum(["gateway", "direct"]),
    mode: z.enum(["byok", "official"]),
    status: z.enum(["success", "needs_review", "failed", "degraded"]),
    iterationCount: z.number().int().nonnegative(),
    startedAt: z.string().min(1),
    finishedAt: z.string().min(1),
    totalDurationMs: z.number().nonnegative()
  }),
  draft: z.object({
    normalizedIntent: z.string().min(1),
    assumptions: z.array(z.string()),
    constructionPlan: z.array(z.string()),
    namingPlan: z.array(z.string()),
    commandBatchDraft: CommandBatchSchema,
    teachingOutline: z.array(z.string()),
    reviewChecklist: z.array(z.string())
  }),
  reviews: z.array(z.object({ verdict: z.enum(["approve", "revise"]) })).default([]),
  evidence: z.object({
    preflight: z.object({
      status: z.enum(["passed", "failed"]),
      issues: z.array(z.string()),
      referencedLabels: z.array(z.string()),
      generatedLabels: z.array(z.string())
    }),
    canvas: z
      .object({
        executedCommandCount: z.number().int().nonnegative()
      })
      .optional()
  }),
  teacherPacket: z.object({
    summary: z.array(z.string()).min(1),
    warnings: z.array(z.string()),
    uncertainties: z.array(z.string()),
    nextActions: z.array(z.string()),
    canvasLinks: z.array(z.string())
  }),
  telemetry: z.object({
    upstreamCallCount: z.number().int().nonnegative(),
    degraded: z.boolean(),
    stages: z.array(
      z.object({
        name: z.string().min(1),
        status: z.string().min(1),
        durationMs: z.number().nonnegative()
      })
    )
  })
});

export type AgentRunEnvelope = z.infer<typeof AgentRunEnvelopeSchema>;
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @geohelper/protocol test -- test/agent-run.test.ts`  
Expected: PASS with `1 passed`

**Step 5: Commit**

```bash
git add packages/protocol/src/agent-run.ts packages/protocol/src/index.ts packages/protocol/test/agent-run.test.ts
git commit -m "feat: add agent run protocol"
```

### Task 2: Build Gateway Author / Reviewer / Reviser Services

**Files:**
- Create: `apps/gateway/src/services/geometry-author.ts`
- Create: `apps/gateway/src/services/geometry-reviewer.ts`
- Create: `apps/gateway/src/services/geometry-reviser.ts`
- Test: `apps/gateway/test/services/geometry-author.test.ts`
- Test: `apps/gateway/test/services/geometry-reviewer.test.ts`

**Step 1: Write the failing tests**

```ts
import { describe, expect, it, vi } from "vitest";

import { createGeometryAuthor } from "../../src/services/geometry-author";

describe("createGeometryAuthor", () => {
  it("maps llm JSON into a GeometryDraftPackage", async () => {
    const request = vi.fn().mockResolvedValue({
      normalizedIntent: "构造中点",
      assumptions: [],
      constructionPlan: ["先取线段 AB", "再取中点 M"],
      namingPlan: ["A", "B", "M"],
      commandBatchDraft: {
        commands: [],
        explanations: ["草案"],
        post_checks: []
      },
      teachingOutline: ["说明中点定义"],
      reviewChecklist: ["检查 M 是否在线段 AB 上"]
    });

    const author = createGeometryAuthor(request);
    const draft = await author({
      message: "作线段 AB 的中点 M"
    });

    expect(draft.namingPlan).toContain("M");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @geohelper/gateway test -- apps/gateway/test/services/geometry-author.test.ts apps/gateway/test/services/geometry-reviewer.test.ts`  
Expected: FAIL with missing module errors

**Step 3: Write minimal implementation**

```ts
export const createGeometryAuthor =
  (requestCommandBatch: (input: { message: string }) => Promise<unknown>) =>
  async (input: { message: string }) => {
    const response = await requestCommandBatch({
      message: `Return GeometryDraftPackage JSON only. User request: ${input.message}`
    });
    return response as {
      namingPlan: string[];
    };
  };
```

```ts
export const createGeometryReviewer =
  (requestCommandBatch: (input: { message: string }) => Promise<unknown>) =>
  async (draft: { normalizedIntent: string }) =>
    (await requestCommandBatch({
      message: `Review GeometryDraftPackage JSON only. Intent: ${draft.normalizedIntent}`
    })) as {
      verdict: "approve" | "revise";
    };
```

```ts
export const createGeometryReviser =
  (requestCommandBatch: (input: { message: string }) => Promise<unknown>) =>
  async (input: { reviewReport: { repairInstructions?: string[] } }) =>
    (await requestCommandBatch({
      message: `Revise GeometryDraftPackage JSON only. Fixes: ${JSON.stringify(
        input.reviewReport.repairInstructions ?? []
      )}`
    })) as unknown;
```

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter @geohelper/gateway test -- apps/gateway/test/services/geometry-author.test.ts apps/gateway/test/services/geometry-reviewer.test.ts`  
Expected: PASS with both tests green

**Step 5: Commit**

```bash
git add apps/gateway/src/services/geometry-author.ts apps/gateway/src/services/geometry-reviewer.ts apps/gateway/src/services/geometry-reviser.ts apps/gateway/test/services/geometry-author.test.ts apps/gateway/test/services/geometry-reviewer.test.ts
git commit -m "feat: add geometry author reviewer services"
```

### Task 3: Orchestrate The Gateway Agent Workflow And Route

**Files:**
- Create: `apps/gateway/src/services/agent-workflow.ts`
- Create: `apps/gateway/src/routes/agent-runs.ts`
- Modify: `apps/gateway/src/routes/compile.ts`
- Modify: `apps/gateway/src/server.ts`
- Test: `apps/gateway/test/services/agent-workflow.test.ts`
- Test: `apps/gateway/test/routes/agent-runs.test.ts`

**Step 1: Write the failing tests**

```ts
import { describe, expect, it, vi } from "vitest";

import { createAgentWorkflow } from "../../src/services/agent-workflow";

describe("createAgentWorkflow", () => {
  it("returns an approve result without revision when reviewer passes", async () => {
    const workflow = createAgentWorkflow({
      author: vi.fn().mockResolvedValue({ normalizedIntent: "构造角平分线" }),
      reviewer: vi.fn().mockResolvedValue({ verdict: "approve", repairInstructions: [] }),
      reviser: vi.fn(),
      preflight: vi.fn().mockResolvedValue({ status: "passed", issues: [] })
    });

    const result = await workflow({ message: "作角平分线" });
    expect(result.run.status).toBe("success");
    expect(result.run.iterationCount).toBe(1);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @geohelper/gateway test -- apps/gateway/test/services/agent-workflow.test.ts apps/gateway/test/routes/agent-runs.test.ts`  
Expected: FAIL with missing module or route registration errors

**Step 3: Write minimal implementation**

```ts
export const createAgentWorkflow =
  (deps: {
    author: (input: { message: string }) => Promise<{ normalizedIntent: string }>;
    reviewer: (draft: { normalizedIntent: string }) => Promise<{ verdict: "approve" | "revise"; repairInstructions?: string[] }>;
    reviser: (input: { reviewReport: { repairInstructions?: string[] } }) => Promise<{ normalizedIntent: string }>;
    preflight: (draft: { normalizedIntent: string }) => Promise<{ status: "passed" | "failed"; issues: string[] }>;
  }) =>
  async (input: { message: string }) => {
    let draft = await deps.author(input);
    const review = await deps.reviewer(draft);
    if (review.verdict === "revise") {
      draft = await deps.reviser({ reviewReport: review });
    }
    const preflight = await deps.preflight(draft);

    return {
      run: {
        id: "run_test",
        target: "gateway",
        mode: "official",
        status: preflight.status === "passed" ? "success" : "needs_review",
        iterationCount: review.verdict === "revise" ? 2 : 1,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        totalDurationMs: 0
      },
      draft,
      reviews: [review],
      evidence: { preflight },
      teacherPacket: {
        summary: ["已生成图形草案"],
        warnings: preflight.issues,
        uncertainties: [],
        nextActions: ["执行到画布"],
        canvasLinks: []
      },
      telemetry: {
        upstreamCallCount: 0,
        degraded: false,
        stages: []
      }
    };
  };
```

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter @geohelper/gateway test -- apps/gateway/test/services/agent-workflow.test.ts apps/gateway/test/routes/agent-runs.test.ts`  
Expected: PASS and route returns `200` with an `AgentRunEnvelope`

**Step 5: Commit**

```bash
git add apps/gateway/src/services/agent-workflow.ts apps/gateway/src/routes/agent-runs.ts apps/gateway/src/routes/compile.ts apps/gateway/src/server.ts apps/gateway/test/services/agent-workflow.test.ts apps/gateway/test/routes/agent-runs.test.ts
git commit -m "feat: add gateway agent workflow route"
```

### Task 4: Upgrade Gateway Events And Metrics Around `AgentRun`

**Files:**
- Modify: `apps/gateway/src/services/compile-events.ts`
- Modify: `apps/gateway/src/services/metrics.ts`
- Create: `apps/gateway/test/services/agent-run-events.test.ts`
- Create: `apps/gateway/test/services/agent-run-metrics.test.ts`

**Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";

import { createMemoryCompileEventSink, readCompileTraceDetails } from "../../src/services/compile-events";

describe("agent run events", () => {
  it("records agent_run_success with iteration metadata", async () => {
    const sink = createMemoryCompileEventSink();
    await sink.write({
      event: "compile_success",
      finalStatus: "success",
      traceId: "tr_run_1",
      requestId: "req_1",
      path: "/api/v2/agent/runs",
      method: "POST",
      statusCode: 200,
      upstreamCallCount: 3,
      metadata: {
        iterationCount: 2,
        reviewerVerdict: "approve"
      }
    });

    const trace = await readCompileTraceDetails(sink, "tr_run_1");
    expect(trace?.events[0]?.metadata?.iterationCount).toBe(2);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @geohelper/gateway test -- apps/gateway/test/services/agent-run-events.test.ts apps/gateway/test/services/agent-run-metrics.test.ts`  
Expected: FAIL because metrics snapshots do not expose run-quality fields yet

**Step 3: Write minimal implementation**

```ts
export const recordAgentRunQualitySample = (
  sample: {
    iterationCount: number;
    degraded: boolean;
  },
  store = defaultMetricsStore
): void => {
  writeUpdatedState(store, (state) => {
    state.perfSampleCount += 0;
    state.totalFallbackCount += sample.degraded ? 1 : 0;
    state.totalRetryCount += Math.max(0, sample.iterationCount - 1);
    return state;
  });
};
```

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter @geohelper/gateway test -- apps/gateway/test/services/agent-run-events.test.ts apps/gateway/test/services/agent-run-metrics.test.ts`  
Expected: PASS with trace metadata and metrics snapshot assertions green

**Step 5: Commit**

```bash
git add apps/gateway/src/services/compile-events.ts apps/gateway/src/services/metrics.ts apps/gateway/test/services/agent-run-events.test.ts apps/gateway/test/services/agent-run-metrics.test.ts
git commit -m "feat: add agent run observability"
```

### Task 5: Cut Web Runtime Clients Over To `AgentRunEnvelope`

**Files:**
- Modify: `apps/web/src/runtime/types.ts`
- Modify: `apps/web/src/runtime/gateway-client.ts`
- Modify: `apps/web/src/runtime/direct-client.ts`
- Modify: `apps/web/src/runtime/runtime-service.ts`
- Test: `apps/web/src/runtime/gateway-client.compile.test.ts`
- Test: `apps/web/src/runtime/direct-client.test.ts`

**Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";

import { normalizeAgentRunEnvelope } from "./types";

describe("normalizeAgentRunEnvelope", () => {
  it("reads summary and review packet fields from runtime responses", () => {
    const normalized = normalizeAgentRunEnvelope({
      run: {
        id: "run_1",
        target: "gateway",
        mode: "official",
        status: "success",
        iterationCount: 1,
        startedAt: "2026-03-17T10:00:00.000Z",
        finishedAt: "2026-03-17T10:00:01.000Z",
        totalDurationMs: 1000
      },
      draft: {},
      reviews: [],
      evidence: { preflight: { status: "passed", issues: [], referencedLabels: [], generatedLabels: [] } },
      teacherPacket: {
        summary: ["已生成草案"],
        warnings: [],
        uncertainties: [],
        nextActions: [],
        canvasLinks: []
      },
      telemetry: { upstreamCallCount: 1, degraded: false, stages: [] }
    });

    expect(normalized.teacherPacket.summary[0]).toBe("已生成草案");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @geohelper/web test -- src/runtime/gateway-client.compile.test.ts src/runtime/direct-client.test.ts`  
Expected: FAIL because runtime types still expect `batch` responses

**Step 3: Write minimal implementation**

```ts
export interface RuntimeAgentRunResponse {
  trace_id?: string;
  agent_run: AgentRunEnvelope;
}
```

```ts
return {
  trace_id: payload.trace_id,
  agent_run: AgentRunEnvelopeSchema.parse(payload.agent_run)
};
```

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter @geohelper/web test -- src/runtime/gateway-client.compile.test.ts src/runtime/direct-client.test.ts`  
Expected: PASS with both runtime client suites green

**Step 5: Commit**

```bash
git add apps/web/src/runtime/types.ts apps/web/src/runtime/gateway-client.ts apps/web/src/runtime/direct-client.ts apps/web/src/runtime/runtime-service.ts apps/web/src/runtime/gateway-client.compile.test.ts apps/web/src/runtime/direct-client.test.ts
git commit -m "feat: return agent runs from runtime clients"
```

### Task 6: Add A Dedicated Web `agent-run` Store And Panel

**Files:**
- Create: `apps/web/src/state/agent-run-store.ts`
- Create: `apps/web/src/state/agent-run-view-model.ts`
- Create: `apps/web/src/components/agent-run-panel.tsx`
- Modify: `apps/web/src/state/chat-store.ts`
- Modify: `apps/web/src/state/chat-send-flow.ts`
- Modify: `apps/web/src/components/studio-result-panel.ts`
- Test: `apps/web/src/state/agent-run-store.test.ts`
- Test: `apps/web/src/components/agent-run-panel.test.tsx`

**Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";

import { createAgentRunStore } from "./agent-run-store";

describe("createAgentRunStore", () => {
  it("stores the latest run by id and exposes it to the active message", () => {
    const store = createAgentRunStore();

    store.getState().upsertRun({
      run: { id: "run_1", status: "success" },
      teacherPacket: { summary: ["已生成草案"] }
    } as never);

    expect(store.getState().runsById.run_1.teacherPacket.summary[0]).toBe("已生成草案");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @geohelper/web test -- src/state/agent-run-store.test.ts src/components/agent-run-panel.test.tsx`  
Expected: FAIL with missing file errors

**Step 3: Write minimal implementation**

```ts
import { createStore } from "zustand/vanilla";

export const createAgentRunStore = () =>
  createStore<{
    runsById: Record<string, unknown>;
    upsertRun: (run: { run: { id: string } }) => void;
  }>((set) => ({
    runsById: {},
    upsertRun: (run) =>
      set((state) => ({
        runsById: {
          ...state.runsById,
          [run.run.id]: run
        }
      }))
  }));
```

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter @geohelper/web test -- src/state/agent-run-store.test.ts src/components/agent-run-panel.test.tsx`  
Expected: PASS with store and panel assertions green

**Step 5: Commit**

```bash
git add apps/web/src/state/agent-run-store.ts apps/web/src/state/agent-run-view-model.ts apps/web/src/components/agent-run-panel.tsx apps/web/src/state/chat-store.ts apps/web/src/state/chat-send-flow.ts apps/web/src/components/studio-result-panel.ts apps/web/src/state/agent-run-store.test.ts apps/web/src/components/agent-run-panel.test.tsx
git commit -m "feat: add web agent run state and panel"
```

### Task 7: Add Browser Canvas Evidence And Targeted Repair

**Files:**
- Create: `apps/web/src/state/canvas-evidence.ts`
- Create: `apps/web/src/state/canvas-evidence.test.ts`
- Modify: `apps/web/src/state/chat-send-flow.ts`
- Create: `apps/gateway/src/services/geometry-browser-repair.ts`
- Create: `apps/gateway/test/services/geometry-browser-repair.test.ts`
- Create: `tests/e2e/agent-run-repair.spec.ts`

**Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";

import { buildCanvasEvidence } from "./canvas-evidence";

describe("buildCanvasEvidence", () => {
  it("captures failed commands and visible labels from the executed scene", () => {
    const evidence = buildCanvasEvidence({
      executedCommandIds: ["c1", "c2"],
      failedCommandIds: ["c2"],
      visibleLabels: ["A", "B", "M"]
    });

    expect(evidence.failedCommandIds).toEqual(["c2"]);
    expect(evidence.visibleLabels).toContain("M");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @geohelper/web test -- src/state/canvas-evidence.test.ts`  
Expected: FAIL because canvas evidence helpers do not exist

Run: `pnpm exec playwright test tests/e2e/agent-run-repair.spec.ts`  
Expected: FAIL because canvas evidence helpers and repair flow do not exist

**Step 3: Write minimal implementation**

```ts
export const buildCanvasEvidence = (input: {
  executedCommandIds: string[];
  failedCommandIds: string[];
  visibleLabels: string[];
}) => ({
  executedCommandCount: input.executedCommandIds.length,
  failedCommandIds: input.failedCommandIds,
  visibleLabels: input.visibleLabels
});
```

```ts
export const createGeometryBrowserRepair =
  (requestCommandBatch: (input: { message: string }) => Promise<unknown>) =>
  async (input: { teacherInstruction: string; canvasEvidence: { visibleLabels: string[] } }) =>
    requestCommandBatch({
      message: `Repair current geometry draft using teacher instruction "${input.teacherInstruction}" and labels ${input.canvasEvidence.visibleLabels.join(", ")}`
    });
```

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter @geohelper/web test -- src/state/canvas-evidence.test.ts`  
Expected: PASS with canvas evidence helpers green

Run: `pnpm exec playwright test tests/e2e/agent-run-repair.spec.ts`  
Expected: PASS with repair CTA flowing from result panel to repaired run

**Step 5: Commit**

```bash
git add apps/web/src/state/canvas-evidence.ts apps/web/src/state/chat-send-flow.ts apps/gateway/src/services/geometry-browser-repair.ts apps/gateway/test/services/geometry-browser-repair.test.ts tests/e2e/agent-run-repair.spec.ts
git commit -m "feat: add canvas evidence repair loop"
```

### Task 8: Delete Legacy Chain And Run Full Verification

**Files:**
- Delete: `apps/gateway/src/services/multi-agent.ts`
- Delete: `apps/gateway/src/services/compile-agent.ts`
- Modify: `apps/gateway/src/routes/compile.ts`
- Create: `apps/gateway/test/routes/compile-route-removal.test.ts`
- Modify: `docs/plans/2026-03-17-agent-vnext-inspired-by-manim-generator-design.md`
- Modify: `docs/plans/2026-03-17-product-scope-reset-design.md`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

describe("legacy multi-agent removal", () => {
  it("does not import the legacy multi-agent implementation anywhere", async () => {
    const content = await import("node:fs/promises").then((fs) =>
      fs.readFile("apps/gateway/src/routes/compile.ts", "utf8")
    );
    expect(content.includes("multi-agent")).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @geohelper/gateway test -- apps/gateway/test/routes/compile-route-removal.test.ts`  
Expected: FAIL because old import still exists

**Step 3: Write minimal implementation**

```ts
// Remove compileWithMultiAgent / compileWithSingleAgent imports
// Route now forwards all geometry generation through the new agent workflow
```

**Step 4: Run full verification**

Run: `pnpm test`  
Expected: PASS

Run: `pnpm typecheck`  
Expected: PASS

Run: `pnpm --filter @geohelper/web build`  
Expected: PASS

Run: `pnpm exec playwright test tests/e2e/agent-run-repair.spec.ts tests/e2e/studio-review-flow.spec.ts tests/e2e/studio-canvas-link.spec.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: replace legacy compile chain with agent run workflow"
```

## Execution Notes

1. 这是一次明确的 `clean cut`，不要求对旧 `message.result` 结构保持兼容。
2. 若执行过程中发现 Direct runtime 的 reviewer loop 因 CORS 或成本不可接受，可先以 `Gateway full / Direct lite` 交付，但协议必须保持一致。
3. 每完成一个 Task 都应先做代码评审，再继续下一个 Task。

Plan complete and saved to `docs/plans/2026-03-17-agent-vnext-inspired-by-manim-generator-implementation-plan.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
