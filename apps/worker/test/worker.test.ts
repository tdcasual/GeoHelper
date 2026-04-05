import { createMemoryAgentStore } from "@geohelper/agent-store";
import { describe, expect, it } from "vitest";

import { createGeometryWorkerRuntime } from "../src/worker";

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

    expect(result?.status).toBe("completed");
    expect(run?.status).toBe("completed");
  });
});
