import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { PortableDelegationConfig } from "@geohelper/agent-bundle";
import { createPlatformRuntimeContext } from "@geohelper/agent-core";
import type { Run } from "@geohelper/agent-protocol";
import { createMemoryAgentStore } from "@geohelper/agent-store";
import { describe, expect, it } from "vitest";

import { createRunLoop } from "../src/run-loop";

const geometryBundleDir = path.resolve(
  fileURLToPath(new URL("../../../agents/geometry-solver", import.meta.url))
);

const createTestBundleMetadata = (rootDir = geometryBundleDir) => ({
  bundleId: "geometry_solver",
  schemaVersion: "2",
  rootDir,
  workspaceBootstrapFiles: [
    "workspace/AGENTS.md",
    "workspace/IDENTITY.md",
    "workspace/USER.md",
    "workspace/TOOLS.md",
    "workspace/MEMORY.md",
    "workspace/STANDING_ORDERS.md"
  ],
  hostRequirements: ["workspace.scene.read", "workspace.scene.write"],
  promptAssetPaths: [
    "prompts/planner.md",
    "prompts/executor.md",
    "prompts/synthesizer.md"
  ]
});

const createDelegationBundleDir = (
  delegationConfig: PortableDelegationConfig
): string => {
  const tempDir = mkdtempSync(
    path.join(os.tmpdir(), "geohelper-delegation-bundle-")
  );

  cpSync(geometryBundleDir, tempDir, {
    recursive: true
  });
  writeFileSync(
    path.join(tempDir, "delegations/subagents.json"),
    JSON.stringify(delegationConfig, null, 2)
  );

  return tempDir;
};

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
    const bundleDir = createDelegationBundleDir({
      delegations: [
        {
          name: "child_review",
          mode: "native-subagent",
          agentRef: "profile_child",
          awaitCompletion: false
        }
      ]
    });

    try {
      await store.runs.createRun(createRun());

      const loop = createRunLoop({
        store,
        platformRuntime: createPlatformRuntimeContext({
          agents: {
            geometry_solver: {
              id: "geometry_solver",
              name: "Geometry Solver",
              description: "Test agent",
              defaultBudget: {
                maxModelCalls: 6,
                maxToolCalls: 8,
                maxDurationMs: 120000
              },
              bundle: createTestBundleMetadata(bundleDir)
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
                    delegation: "child_review"
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
    } finally {
      rmSync(bundleDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("waits for awaited child runs and resumes the parent with child artifacts", async () => {
    const store = createMemoryAgentStore();
    const bundleDir = createDelegationBundleDir({
      delegations: [
        {
          name: "child_review",
          mode: "native-subagent",
          agentRef: "profile_child",
          awaitCompletion: true
        }
      ]
    });

    try {
      await store.runs.createRun(createRun());

      const loop = createRunLoop({
        store,
        platformRuntime: createPlatformRuntimeContext({
          agents: {
            geometry_solver: {
              id: "geometry_solver",
              name: "Geometry Solver",
              description: "Test agent",
              defaultBudget: {
                maxModelCalls: 6,
                maxToolCalls: 8,
                maxDurationMs: 120000
              },
              bundle: createTestBundleMetadata(bundleDir)
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
                    delegation: "child_review"
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
          inputArtifactIds: expect.arrayContaining([
            "artifact_child_output",
            "artifact_response_run_child_run_parent_node_spawn_node_child_finish"
          ]),
          outputArtifactIds: ["artifact_response_run_parent_node_finish"]
        })
      );
      expect(parentEvents.map((event) => event.type)).toEqual(
        expect.arrayContaining(["subagent.waiting", "subagent.completed", "run.completed"])
      );
    } finally {
      rmSync(bundleDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("routes acp-agent delegations into checkpoints instead of child runs", async () => {
    const store = createMemoryAgentStore();
    const bundleDir = createDelegationBundleDir({
      delegations: [
        {
          name: "teacher_review",
          mode: "acp-agent",
          agentRef: "openclaw.geometry-reviewer",
          awaitCompletion: true
        }
      ]
    });

    try {
      await store.runs.createRun(createRun());

      const loop = createRunLoop({
        store,
        platformRuntime: createPlatformRuntimeContext({
          agents: {
            geometry_solver: {
              id: "geometry_solver",
              name: "Geometry Solver",
              description: "Test agent",
              defaultBudget: {
                maxModelCalls: 6,
                maxToolCalls: 8,
                maxDurationMs: 120000
              },
              bundle: createTestBundleMetadata(bundleDir)
            }
          },
          runProfiles: {
            profile_parent: {
              id: "profile_parent",
              name: "Parent profile",
              description: "Delegates to ACP",
              agentId: "geometry_solver",
              workflowId: "wf_parent",
              defaultBudget: {
                maxModelCalls: 6,
                maxToolCalls: 8,
                maxDurationMs: 120000
              }
            }
          },
          runProfileMap: new Map([
            [
              "profile_parent",
              {
                id: "profile_parent",
                name: "Parent profile",
                description: "Delegates to ACP",
                agentId: "geometry_solver",
                workflowId: "wf_parent",
                defaultBudget: {
                  maxModelCalls: 6,
                  maxToolCalls: 8,
                  maxDurationMs: 120000
                }
              }
            ]
          ]),
          workflows: {
            wf_parent: {
              id: "wf_parent",
              version: 1,
              entryNodeId: "node_delegate",
              nodes: [
                {
                  id: "node_delegate",
                  kind: "subagent",
                  name: "Delegate externally",
                  config: {
                    delegation: "teacher_review"
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
          },
          tools: {},
          evaluators: {}
        })
      });

      loop.enqueue("run_parent");

      const result = await loop.tick();
      const checkpoints = await store.checkpoints.listCheckpointsByStatus("pending");
      const acpSessions = await store.acpSessions.listSessions({
        status: "pending"
      });
      const childRuns = await store.runs.listRuns({
        parentRunId: "run_parent"
      });

      expect(result?.status).toBe("waiting_for_checkpoint");
      expect(childRuns).toEqual([]);
      expect(acpSessions).toEqual([
        expect.objectContaining({
          id: "acp_session_run_parent_node_delegate",
          runId: "run_parent",
          checkpointId: expect.any(String),
          delegationName: "teacher_review",
          agentRef: "openclaw.geometry-reviewer",
          status: "pending",
          outputArtifactIds: []
        })
      ]);
      expect(checkpoints).toEqual([
        expect.objectContaining({
          kind: "human_input",
          metadata: expect.objectContaining({
            delegationMode: "acp-agent",
            delegationName: "teacher_review",
            agentRef: "openclaw.geometry-reviewer"
          })
        })
      ]);
    } finally {
      rmSync(bundleDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("fails clearly when a delegation name is missing from the bundle config", async () => {
    const store = createMemoryAgentStore();
    const bundleDir = createDelegationBundleDir({
      delegations: []
    });

    try {
      await store.runs.createRun(createRun());

      const loop = createRunLoop({
        store,
        platformRuntime: createPlatformRuntimeContext({
          agents: {
            geometry_solver: {
              id: "geometry_solver",
              name: "Geometry Solver",
              description: "Test agent",
              defaultBudget: {
                maxModelCalls: 6,
                maxToolCalls: 8,
                maxDurationMs: 120000
              },
              bundle: createTestBundleMetadata(bundleDir)
            }
          },
          runProfiles: {
            profile_parent: {
              id: "profile_parent",
              name: "Parent profile",
              description: "Delegation missing",
              agentId: "geometry_solver",
              workflowId: "wf_parent",
              defaultBudget: {
                maxModelCalls: 6,
                maxToolCalls: 8,
                maxDurationMs: 120000
              }
            }
          },
          runProfileMap: new Map([
            [
              "profile_parent",
              {
                id: "profile_parent",
                name: "Parent profile",
                description: "Delegation missing",
                agentId: "geometry_solver",
                workflowId: "wf_parent",
                defaultBudget: {
                  maxModelCalls: 6,
                  maxToolCalls: 8,
                  maxDurationMs: 120000
                }
              }
            ]
          ]),
          workflows: {
            wf_parent: {
              id: "wf_parent",
              version: 1,
              entryNodeId: "node_delegate",
              nodes: [
                {
                  id: "node_delegate",
                  kind: "subagent",
                  name: "Missing delegation",
                  config: {
                    delegation: "missing_review"
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
          },
          tools: {},
          evaluators: {}
        })
      });

      loop.enqueue("run_parent");

      const result = await loop.tick();
      const run = await store.runs.getRun("run_parent");
      const events = await store.events.listRunEvents("run_parent");

      expect(result?.status).toBe("failed");
      expect(result?.failureReason).toBe("delegation_error");
      expect(run?.status).toBe("failed");
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "run.failed",
            payload: expect.objectContaining({
              reason: "delegation_error",
              message: "Missing delegation config: missing_review"
            })
          })
        ])
      );
    } finally {
      rmSync(bundleDir, {
        recursive: true,
        force: true
      });
    }
  });
});
