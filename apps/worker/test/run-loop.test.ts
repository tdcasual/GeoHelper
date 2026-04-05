import { createPlatformRuntimeContext } from "@geohelper/agent-core";
import { createGeometryDomainPackage } from "@geohelper/agent-domain-geometry";
import type { Run } from "@geohelper/agent-protocol";
import { createMemoryAgentStore } from "@geohelper/agent-store";
import { describe, expect, it } from "vitest";

import { createRunLoop } from "../src/run-loop";

const createRun = (overrides: Partial<Run> = {}) => ({
  id: "run_1",
  threadId: "thread_1",
  profileId: "profile_basic",
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

const createTestPlatformRuntime = (input: {
  profileId: string;
  workflowId: string;
  workflow: {
    id: string;
    version: number;
    entryNodeId: string;
    nodes: Array<{
      id: string;
      kind:
        | "planner"
        | "model"
        | "tool"
        | "router"
        | "checkpoint"
        | "evaluator"
        | "subagent"
        | "synthesizer";
      name: string;
      config: Record<string, unknown>;
      next: string[];
    }>;
  };
  tools?: Record<string, unknown>;
  evaluators?: Record<string, unknown>;
}) =>
  createPlatformRuntimeContext({
    agents: {
      geometry_solver: {
        id: "geometry_solver",
        name: "Geometry Solver",
        description: "Test agent",
        workflowId: input.workflowId,
        toolNames: Object.keys(input.tools ?? {}),
        evaluatorNames: Object.keys(input.evaluators ?? {}),
        defaultBudget: {
          maxModelCalls: 6,
          maxToolCalls: 8,
          maxDurationMs: 120000
        }
      }
    },
    runProfiles: {
      [input.profileId]: {
        id: input.profileId,
        name: "Test workflow",
        description: "Test run profile",
        agentId: "geometry_solver",
        workflowId: input.workflowId,
        defaultBudget: {
          maxModelCalls: 6,
          maxToolCalls: 8,
          maxDurationMs: 120000
        }
      }
    },
    runProfileMap: new Map([
      [
        input.profileId,
        {
          id: input.profileId,
          name: "Test workflow",
          description: "Test run profile",
          agentId: "geometry_solver",
          workflowId: input.workflowId,
          defaultBudget: {
            maxModelCalls: 6,
            maxToolCalls: 8,
            maxDurationMs: 120000
          }
        }
      ]
    ]),
    workflows: {
      [input.workflowId]: input.workflow
    },
    tools: input.tools ?? {},
    evaluators: input.evaluators ?? {}
  });

describe("worker run loop", () => {
  it("claims queued runs in FIFO order", () => {
    const loop = createRunLoop({
      store: createMemoryAgentStore(),
      platformRuntime: createPlatformRuntimeContext({
        agents: {},
        runProfiles: {},
        runProfileMap: new Map(),
        workflows: {},
        tools: {},
        evaluators: {}
      })
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
      platformRuntime: createTestPlatformRuntime({
        profileId: "profile_basic",
        workflowId: "wf_basic",
        workflow: {
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
      })
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
      profileId: "profile_browser_tool"
    }));

    const loop = createRunLoop({
      store,
      platformRuntime: createTestPlatformRuntime({
        profileId: "profile_browser_tool",
        workflowId: "wf_browser_tool",
        workflow: {
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
        },
        tools: {
          "scene.read_state": {}
        }
      })
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
      profileId: "profile_browser_tool"
    }));

    const loop = createRunLoop({
      store,
      platformRuntime: createTestPlatformRuntime({
        profileId: "profile_browser_tool",
        workflowId: "wf_browser_tool",
        workflow: {
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
        },
        tools: {
          "scene.apply_command_batch": {}
        }
      })
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

  it("fails runs whose selected profile is missing from the worker catalog", async () => {
    const store = createMemoryAgentStore();

    await store.runs.createRun(createRun({
      profileId: "profile_missing"
    }));

    const loop = createRunLoop({
      store,
      platformRuntime: createPlatformRuntimeContext({
        agents: {},
        runProfiles: {},
        runProfileMap: new Map(),
        workflows: {},
        tools: {},
        evaluators: {}
      })
    });

    loop.enqueue("run_1");

    const result = await loop.tick();
    const run = await store.runs.getRun("run_1");

    expect(result?.status).toBe("failed");
    expect(run?.status).toBe("failed");
  });

  it("executes runs from the shared geometry platform registry", async () => {
    const store = createMemoryAgentStore();
    const geometryDomain = createGeometryDomainPackage();

    await store.runs.createRun(createRun({
      profileId: "platform_geometry_standard"
    }));

    const loop = createRunLoop({
      store,
      platformRuntime: createPlatformRuntimeContext(geometryDomain),
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

    loop.enqueue("run_1");

    const result = await loop.tick();
    const run = await store.runs.getRun("run_1");

    expect(result?.status).toBe("completed");
    expect(run?.status).toBe("completed");
  });
});
