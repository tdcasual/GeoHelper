import { createPlatformRuntimeContext } from "@geohelper/agent-core";
import { createGeometryPlatformBootstrap } from "@geohelper/agent-domain-geometry";
import { createMemoryAgentStore } from "@geohelper/agent-store";
import { describe, expect, it } from "vitest";

import { createGeometryWorkerRuntime, createWorkerRuntime } from "../src/worker";

describe("worker runtime", () => {
  it("boots from the shared geometry platform registry", async () => {
    const store = createMemoryAgentStore();

    await store.runs.createRun({
      id: "run_1",
      threadId: "thread_1",
      profileId: "platform_geometry_standard",
      status: "queued",
      inputArtifactIds: [],
      outputArtifactIds: [],
      budget: {
        maxModelCalls: 6,
        maxToolCalls: 8,
        maxDurationMs: 120000
      },
      createdAt: "2026-04-05T00:00:00.000Z",
      updatedAt: "2026-04-05T00:00:00.000Z"
    });

    const runtime = createGeometryWorkerRuntime({
      store,
      handlers: {
        planner: async () => ({ type: "continue" }),
        tool: async () => ({ type: "continue" }),
        evaluator: async () => ({ type: "continue" }),
        router: async () => ({
          type: "route",
          nextNodeId: "node_finish_response"
        }),
        synthesizer: async () => ({ type: "complete" })
      }
    });

    runtime.runLoop.enqueue("run_1");

    const result = await runtime.runLoop.tick();
    const run = await store.runs.getRun("run_1");

    expect(runtime.platformRuntime.bootstrap.runProfiles.platform_geometry_standard).toBeDefined();
    expect(runtime.platformRuntime.tools["scene.read_state"]).toBeDefined();
    expect(result?.status).toBe("completed");
    expect(run?.status).toBe("completed");
  });

  it("fails queued runs when the shared runtime context is missing an evaluator", async () => {
    const store = createMemoryAgentStore();

    await store.runs.createRun({
      id: "run_1",
      threadId: "thread_1",
      profileId: "platform_geometry_standard",
      status: "queued",
      inputArtifactIds: [],
      outputArtifactIds: [],
      budget: {
        maxModelCalls: 6,
        maxToolCalls: 8,
        maxDurationMs: 120000
      },
      createdAt: "2026-04-05T00:00:00.000Z",
      updatedAt: "2026-04-05T00:00:00.000Z"
    });

    const bootstrap = createGeometryPlatformBootstrap();
    const runtime = createWorkerRuntime({
      store,
      platformRuntime: createPlatformRuntimeContext({
        ...bootstrap,
        evaluators: {}
      })
    });

    runtime.runLoop.enqueue("run_1");

    const result = await runtime.runLoop.tick();
    const run = await store.runs.getRun("run_1");

    expect(result?.status).toBe("failed");
    expect(result?.failureReason).toBe("missing_evaluator");
    expect(run?.status).toBe("failed");
  });
});
