import { createPlatformRuntimeContext } from "@geohelper/agent-core";
import type { Run } from "@geohelper/agent-protocol";
import { createMemoryAgentStore } from "@geohelper/agent-store";
import { describe, expect, it } from "vitest";

import { createRunLoop } from "../src/run-loop";

const createRun = (overrides: Partial<Run> = {}) => ({
  id: "run_parent",
  threadId: "thread_1",
  profileId: "profile_parent",
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

describe("worker run loop subagent handling", () => {
  it("creates and enqueues child runs for subagent nodes", async () => {
    const store = createMemoryAgentStore();

    await store.runs.createRun(createRun());

    const loop = createRunLoop({
      store,
      platformRuntime: createPlatformRuntimeContext({
        agents: {
          geometry_solver: {
            id: "geometry_solver",
            name: "Geometry Solver",
            description: "Test agent",
            workflowId: "wf_parent",
            toolNames: [],
            evaluatorNames: [],
            defaultBudget: {
              maxModelCalls: 6,
              maxToolCalls: 8,
              maxDurationMs: 120000
            }
          }
        },
        runProfiles: {
          profile_parent: {
            id: "profile_parent",
            name: "Parent profile",
            description: "Spawns child runs",
            agentId: "geometry_solver",
            workflowId: "wf_parent",
            defaultBudget: {
              maxModelCalls: 6,
              maxToolCalls: 8,
              maxDurationMs: 120000
            }
          },
          profile_child: {
            id: "profile_child",
            name: "Child profile",
            description: "Completes quickly",
            agentId: "geometry_solver",
            workflowId: "wf_child",
            defaultBudget: {
              maxModelCalls: 3,
              maxToolCalls: 4,
              maxDurationMs: 60000
            }
          }
        },
        runProfileMap: new Map([
          [
            "profile_parent",
            {
              id: "profile_parent",
              name: "Parent profile",
              description: "Spawns child runs",
              agentId: "geometry_solver",
              workflowId: "wf_parent",
              defaultBudget: {
                maxModelCalls: 6,
                maxToolCalls: 8,
                maxDurationMs: 120000
              }
            }
          ],
          [
            "profile_child",
            {
              id: "profile_child",
              name: "Child profile",
              description: "Completes quickly",
              agentId: "geometry_solver",
              workflowId: "wf_child",
              defaultBudget: {
                maxModelCalls: 3,
                maxToolCalls: 4,
                maxDurationMs: 60000
              }
            }
          ]
        ]),
        workflows: {
          wf_parent: {
            id: "wf_parent",
            version: 1,
            entryNodeId: "node_spawn",
            nodes: [
              {
                id: "node_spawn",
                kind: "subagent",
                name: "Spawn child",
                config: {
                  runProfileId: "profile_child"
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
          wf_child: {
            id: "wf_child",
            version: 1,
            entryNodeId: "node_child_finish",
            nodes: [
              {
                id: "node_child_finish",
                kind: "synthesizer",
                name: "Finish child",
                config: {},
                next: []
              }
            ]
          }
        },
        tools: {},
        evaluators: {}
      })
    });

    loop.enqueue("run_parent");

    const parentResult = await loop.tick();
    const childRuns = await store.runs.listRuns({
      parentRunId: "run_parent"
    });
    const nextDispatch = await store.dispatches.claimNextDispatch({
      workerId: "worker_observer",
      claimedAt: "2026-04-04T00:01:00.000Z"
    });

    expect(parentResult?.status).toBe("completed");
    expect(childRuns).toEqual([
      expect.objectContaining({
        parentRunId: "run_parent",
        threadId: "thread_1",
        profileId: "profile_child",
        status: "queued"
      })
    ]);
    expect(nextDispatch?.runId).toBe(childRuns[0]?.id);
  });

  it("waits for awaited child runs and resumes the parent with child artifacts", async () => {
    const store = createMemoryAgentStore();

    await store.runs.createRun(createRun());

    const loop = createRunLoop({
      store,
      platformRuntime: createPlatformRuntimeContext({
        agents: {
          geometry_solver: {
            id: "geometry_solver",
            name: "Geometry Solver",
            description: "Test agent",
            workflowId: "wf_parent",
            toolNames: [],
            evaluatorNames: [],
            defaultBudget: {
              maxModelCalls: 6,
              maxToolCalls: 8,
              maxDurationMs: 120000
            }
          }
        },
        runProfiles: {
          profile_parent: {
            id: "profile_parent",
            name: "Parent profile",
            description: "Waits on child runs",
            agentId: "geometry_solver",
            workflowId: "wf_parent",
            defaultBudget: {
              maxModelCalls: 6,
              maxToolCalls: 8,
              maxDurationMs: 120000
            }
          },
          profile_child: {
            id: "profile_child",
            name: "Child profile",
            description: "Completes quickly",
            agentId: "geometry_solver",
            workflowId: "wf_child",
            defaultBudget: {
              maxModelCalls: 3,
              maxToolCalls: 4,
              maxDurationMs: 60000
            }
          }
        },
        runProfileMap: new Map([
          [
            "profile_parent",
            {
              id: "profile_parent",
              name: "Parent profile",
              description: "Waits on child runs",
              agentId: "geometry_solver",
              workflowId: "wf_parent",
              defaultBudget: {
                maxModelCalls: 6,
                maxToolCalls: 8,
                maxDurationMs: 120000
              }
            }
          ],
          [
            "profile_child",
            {
              id: "profile_child",
              name: "Child profile",
              description: "Completes quickly",
              agentId: "geometry_solver",
              workflowId: "wf_child",
              defaultBudget: {
                maxModelCalls: 3,
                maxToolCalls: 4,
                maxDurationMs: 60000
              }
            }
          ]
        ]),
        workflows: {
          wf_parent: {
            id: "wf_parent",
            version: 1,
            entryNodeId: "node_spawn",
            nodes: [
              {
                id: "node_spawn",
                kind: "subagent",
                name: "Spawn child",
                config: {
                  runProfileId: "profile_child",
                  awaitCompletion: true
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
          wf_child: {
            id: "wf_child",
            version: 1,
            entryNodeId: "node_child_finish",
            nodes: [
              {
                id: "node_child_finish",
                kind: "synthesizer",
                name: "Finish child",
                config: {},
                next: []
              }
            ]
          }
        },
        tools: {},
        evaluators: {}
      })
    });

    loop.enqueue("run_parent");

    const parentWaiting = await loop.tick();
    const childRun = await store.runs.getRun("run_child_run_parent_node_spawn");

    expect(parentWaiting?.status).toBe("waiting_for_subagent");
    expect(childRun?.status).toBe("queued");

    await store.runs.createRun({
      ...childRun!,
      outputArtifactIds: ["artifact_child_output"]
    });

    const childResult = await loop.tick();
    const resumedParent = await loop.tick();
    const parentRun = await store.runs.getRun("run_parent");
    const parentEvents = await store.events.listRunEvents("run_parent");

    expect(childResult?.status).toBe("completed");
    expect(resumedParent?.status).toBe("completed");
    expect(parentRun).toEqual(
      expect.objectContaining({
        status: "completed",
        inputArtifactIds: ["artifact_child_output"]
      })
    );
    expect(parentEvents.map((event) => event.type)).toEqual(
      expect.arrayContaining(["subagent.waiting", "subagent.completed", "run.completed"])
    );
  });
});
