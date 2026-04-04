import type { Run } from "@geohelper/agent-protocol";
import { createMemoryAgentStore } from "@geohelper/agent-store";
import { describe, expect, it } from "vitest";

import { createRunLoop } from "../src/run-loop";

const createRun = (overrides: Partial<Run> = {}) => ({
  id: "run_1",
  threadId: "thread_1",
  workflowId: "wf_basic",
  agentId: "geometry_solver",
  status: "queued" as const,
  inputArtifactIds: [],
  outputArtifactIds: [],
  budget: {
    maxModelCalls: 6,
    maxToolCalls: 8,
    maxDurationMs: 120000
  },
  createdAt: "2026-04-04T00:00:00.000Z",
  updatedAt: "2026-04-04T00:00:00.000Z",
  ...overrides
});

describe("worker run loop", () => {
  it("claims queued runs in FIFO order", () => {
    const loop = createRunLoop({
      store: createMemoryAgentStore(),
      workflows: {}
    });

    loop.enqueue("run_1");
    loop.enqueue("run_2");

    expect(loop.claimNextRun()).toBe("run_1");
    expect(loop.claimNextRun()).toBe("run_2");
    expect(loop.claimNextRun()).toBeNull();
  });

  it("executes queued nodes to completion", async () => {
    const store = createMemoryAgentStore();

    await store.runs.createRun(createRun());

    const loop = createRunLoop({
      store,
      workflows: {
        wf_basic: {
          id: "wf_basic",
          version: 1,
          entryNodeId: "node_plan",
          nodes: [
            {
              id: "node_plan",
              kind: "planner",
              name: "Plan",
              config: {},
              next: ["node_finish"]
            },
            {
              id: "node_finish",
              kind: "synthesizer",
              name: "Finish",
              config: {},
              next: []
            }
          ]
        }
      }
    });

    loop.enqueue("run_1");

    const result = await loop.tick();
    const run = await store.runs.getRun("run_1");
    const events = await store.events.listRunEvents("run_1");

    expect(result?.status).toBe("completed");
    expect(run?.status).toBe("completed");
    expect(events.map((event) => event.type)).toContain("run.completed");
  });

  it("pauses on browser tool checkpoints", async () => {
    const store = createMemoryAgentStore();

    await store.runs.createRun(createRun({
      workflowId: "wf_browser_tool"
    }));

    const loop = createRunLoop({
      store,
      workflows: {
        wf_browser_tool: {
          id: "wf_browser_tool",
          version: 1,
          entryNodeId: "node_browser_tool",
          nodes: [
            {
              id: "node_browser_tool",
              kind: "tool",
              name: "Read scene state",
              config: {
                toolName: "scene.read_state",
                toolKind: "browser_tool"
              },
              next: ["node_finish"]
            },
            {
              id: "node_finish",
              kind: "synthesizer",
              name: "Finish",
              config: {},
              next: []
            }
          ]
        }
      }
    });

    loop.enqueue("run_1");

    const result = await loop.tick();
    const run = await store.runs.getRun("run_1");
    const checkpoints = await store.checkpoints.listCheckpointsByStatus("pending");

    expect(result?.status).toBe("waiting_for_checkpoint");
    expect(run?.status).toBe("waiting_for_checkpoint");
    expect(checkpoints[0]?.kind).toBe("tool_result");
  });

  it("resumes a paused run after browser tool completion", async () => {
    const store = createMemoryAgentStore();

    await store.runs.createRun(createRun({
      workflowId: "wf_browser_tool"
    }));

    const loop = createRunLoop({
      store,
      workflows: {
        wf_browser_tool: {
          id: "wf_browser_tool",
          version: 1,
          entryNodeId: "node_browser_tool",
          nodes: [
            {
              id: "node_browser_tool",
              kind: "tool",
              name: "Apply command batch",
              config: {
                toolName: "scene.apply_command_batch",
                toolKind: "browser_tool"
              },
              next: ["node_finish"]
            },
            {
              id: "node_finish",
              kind: "synthesizer",
              name: "Finish",
              config: {},
              next: []
            }
          ]
        }
      }
    });

    loop.enqueue("run_1");
    await loop.tick();

    const pendingCheckpoint = (
      await store.checkpoints.listCheckpointsByStatus("pending")
    )[0];

    loop.submitBrowserToolResult({
      runId: "run_1",
      checkpointId: pendingCheckpoint!.id,
      output: {
        artifactId: "artifact_tool_1"
      }
    });
    loop.enqueue("run_1");

    const resumed = await loop.tick();
    const run = await store.runs.getRun("run_1");
    const resolved = await store.checkpoints.listCheckpointsByStatus("resolved");

    expect(resumed?.status).toBe("completed");
    expect(run?.status).toBe("completed");
    expect(resolved.map((checkpoint) => checkpoint.id)).toEqual([
      pendingCheckpoint!.id
    ]);
  });
});
