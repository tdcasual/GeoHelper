import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createPlatformRuntimeContext } from "@geohelper/agent-core";
import {
  createMemoryAgentStore,
  createSqliteAgentStore
} from "@geohelper/agent-store";
import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server";

const parseStreamSnapshot = (payload: string) => {
  const dataLine = payload
    .split("\n")
    .find((line) => line.startsWith("data: "));

  if (!dataLine) {
    throw new Error("missing run snapshot event payload");
  }

  return JSON.parse(dataLine.slice(6)) as {
    run: {
      id: string;
      status: string;
    };
    events: Array<{
      type: string;
    }>;
    checkpoints: Array<{
      id: string;
      kind: string;
      status: string;
    }>;
  };
};

const createTestPlatformRuntime = (input: {
  profileId: string;
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
  tools?: Record<string, { name: string; kind: string }>;
}) => {
  const runProfile = {
    id: input.profileId,
    name: "Test profile",
    description: "Test platform run profile",
    agentId: "geometry_solver",
    workflowId: input.workflow.id,
    defaultBudget: {
      maxModelCalls: 6,
      maxToolCalls: 8,
      maxDurationMs: 120000
    }
  };

  return createPlatformRuntimeContext({
    agents: {
      geometry_solver: {
        id: "geometry_solver",
        name: "Geometry Solver",
        description: "Test agent",
        workflowId: input.workflow.id,
        toolNames: Object.keys(input.tools ?? {}),
        evaluatorNames: [],
        defaultBudget: {
          maxModelCalls: 6,
          maxToolCalls: 8,
          maxDurationMs: 120000
        }
      }
    },
    runProfiles: {
      [input.profileId]: runProfile
    },
    runProfileMap: new Map([[input.profileId, runProfile]]),
    workflows: {
      [input.workflow.id]: input.workflow
    },
    tools: input.tools ?? {},
    evaluators: {}
  });
};

describe("control-plane checkpoint routes", () => {
  it("resolves a pending checkpoint", async () => {
    const store = createMemoryAgentStore();

    await store.runs.createRun({
      id: "run_1",
      threadId: "thread_1",
      profileId: "platform_geometry_standard",
      status: "waiting_for_checkpoint",
      inputArtifactIds: [],
      outputArtifactIds: [],
      budget: {
        maxModelCalls: 6,
        maxToolCalls: 8,
        maxDurationMs: 120000
      },
      createdAt: "2026-04-04T00:00:00.000Z",
      updatedAt: "2026-04-04T00:00:00.000Z"
    });

    await store.checkpoints.upsertCheckpoint({
      id: "checkpoint_1",
      runId: "run_1",
      nodeId: "node_teacher_checkpoint",
      kind: "human_input",
      status: "pending",
      title: "Confirm geometry draft",
      prompt: "请确认是否继续执行。",
      createdAt: "2026-04-04T00:00:00.000Z"
    });

    const app = buildServer({
      store,
      now: () => "2026-04-04T00:01:00.000Z"
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v3/checkpoints/checkpoint_1/resolve",
      payload: {
        response: {
          approved: true
        }
      }
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({
      checkpoint: {
        id: "checkpoint_1",
        runId: "run_1",
        nodeId: "node_teacher_checkpoint",
        kind: "human_input",
        status: "resolved",
        title: "Confirm geometry draft",
        prompt: "请确认是否继续执行。",
        response: {
          approved: true
        },
        createdAt: "2026-04-04T00:00:00.000Z",
        resolvedAt: "2026-04-04T00:01:00.000Z"
      }
    });
  });

  it("rejects invalid browser tool results", async () => {
    const app = buildServer({
      now: () => "2026-04-04T00:00:00.000Z"
    });

    await app.inject({
      method: "POST",
      url: "/api/v3/threads",
      payload: {
        title: "Circle proof"
      }
    });

    await app.inject({
      method: "POST",
      url: "/api/v3/threads/thread_1/runs",
      payload: {
        profileId: "platform_geometry_standard",
        inputArtifactIds: []
      }
    });

    const sessionRes = await app.inject({
      method: "POST",
      url: "/api/v3/browser-sessions",
      payload: {
        runId: "run_1",
        allowedToolNames: ["scene.read_state"]
      }
    });

    expect(sessionRes.statusCode).toBe(201);

    const invalidRes = await app.inject({
      method: "POST",
      url: "/api/v3/browser-sessions/browser_session_1/tool-results",
      payload: {
        runId: "run_1",
        toolName: "scene.apply_command_batch",
        status: "completed",
        output: {}
      }
    });

    expect(invalidRes.statusCode).toBe(400);
    expect(JSON.parse(invalidRes.payload)).toEqual({
      error: "invalid_browser_tool_result"
    });
  });

  it("accepts browser tool results from a persisted session after control-plane restart", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "geohelper-control-plane-"));
    const databasePath = path.join(tempDir, "agent-store.sqlite");

    try {
      const store = createSqliteAgentStore({
        path: databasePath
      });
      const firstApp = buildServer({
        store,
        now: () => "2026-04-04T00:00:00.000Z"
      });

      await firstApp.inject({
        method: "POST",
        url: "/api/v3/threads",
        payload: {
          title: "Restart browser session"
        }
      });

      await firstApp.inject({
        method: "POST",
        url: "/api/v3/threads/thread_1/runs",
        payload: {
          profileId: "platform_geometry_standard",
          inputArtifactIds: []
        }
      });

      const sessionRes = await firstApp.inject({
        method: "POST",
        url: "/api/v3/browser-sessions",
        payload: {
          runId: "run_1",
          allowedToolNames: ["scene.read_state"]
        }
      });

      expect(sessionRes.statusCode).toBe(201);

      const reopenedStore = createSqliteAgentStore({
        path: databasePath
      });
      const secondApp = buildServer({
        store: reopenedStore,
        now: () => "2026-04-04T00:01:00.000Z"
      });

      const res = await secondApp.inject({
        method: "POST",
        url: "/api/v3/browser-sessions/browser_session_1/tool-results",
        payload: {
          runId: "run_1",
          toolName: "scene.read_state",
          status: "completed",
          output: {
            ok: true
          }
        }
      });

      expect(res.statusCode).toBe(202);
    } finally {
      rmSync(tempDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("resumes a waiting run after resolving a human checkpoint", async () => {
    const app = buildServer({
      platformRuntime: createTestPlatformRuntime({
        profileId: "profile_human_checkpoint",
        workflow: {
          id: "wf_human_checkpoint",
          version: 1,
          entryNodeId: "node_plan",
          nodes: [
            {
              id: "node_plan",
              kind: "planner",
              name: "Plan",
              config: {},
              next: ["node_confirm"]
            },
            {
              id: "node_confirm",
              kind: "checkpoint",
              name: "Confirm",
              config: {
                checkpointKind: "human_input"
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
      }),
      now: () => "2026-04-04T00:00:00.000Z"
    });

    await app.inject({
      method: "POST",
      url: "/api/v3/threads",
      payload: {
        title: "Checkpoint resume"
      }
    });

    const runRes = await app.inject({
      method: "POST",
      url: "/api/v3/threads/thread_1/runs",
      payload: {
        profileId: "profile_human_checkpoint",
        inputArtifactIds: []
      }
    });

    expect(runRes.statusCode).toBe(202);

    const queuedSnapshotRes = await app.inject({
      method: "GET",
      url: "/api/v3/runs/run_1/stream"
    });
    const queuedSnapshot = parseStreamSnapshot(queuedSnapshotRes.payload);
    const pendingCheckpoint = queuedSnapshot.checkpoints.find(
      (checkpoint) => checkpoint.status === "pending"
    );

    expect(queuedSnapshot.run.status).toBe("waiting_for_checkpoint");
    expect(pendingCheckpoint?.kind).toBe("human_input");

    const resolveRes = await app.inject({
      method: "POST",
      url: `/api/v3/checkpoints/${pendingCheckpoint?.id}/resolve`,
      payload: {
        response: {
          approved: true
        }
      }
    });

    expect(resolveRes.statusCode).toBe(200);

    const resumedSnapshotRes = await app.inject({
      method: "GET",
      url: "/api/v3/runs/run_1/stream"
    });
    const resumedSnapshot = parseStreamSnapshot(resumedSnapshotRes.payload);

    expect(resumedSnapshot.run.status).toBe("completed");
    expect(resumedSnapshot.events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["checkpoint.resolved", "run.completed"])
    );
  });

  it("resumes a waiting run after accepting a browser tool result", async () => {
    const app = buildServer({
      platformRuntime: createTestPlatformRuntime({
        profileId: "profile_browser_tool",
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
                toolName: "scene.read_state"
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
          "scene.read_state": {
            name: "scene.read_state",
            kind: "browser_tool"
          }
        }
      }),
      now: () => "2026-04-04T00:00:00.000Z"
    });

    await app.inject({
      method: "POST",
      url: "/api/v3/threads",
      payload: {
        title: "Browser tool resume"
      }
    });

    const runRes = await app.inject({
      method: "POST",
      url: "/api/v3/threads/thread_1/runs",
      payload: {
        profileId: "profile_browser_tool",
        inputArtifactIds: []
      }
    });

    expect(runRes.statusCode).toBe(202);

    const queuedSnapshotRes = await app.inject({
      method: "GET",
      url: "/api/v3/runs/run_1/stream"
    });
    const queuedSnapshot = parseStreamSnapshot(queuedSnapshotRes.payload);

    expect(queuedSnapshot.run.status).toBe("waiting_for_checkpoint");
    expect(queuedSnapshot.checkpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "tool_result",
          status: "pending"
        })
      ])
    );

    const sessionRes = await app.inject({
      method: "POST",
      url: "/api/v3/browser-sessions",
      payload: {
        runId: "run_1",
        allowedToolNames: ["scene.read_state"]
      }
    });

    expect(sessionRes.statusCode).toBe(201);

    const toolResultRes = await app.inject({
      method: "POST",
      url: "/api/v3/browser-sessions/browser_session_1/tool-results",
      payload: {
        runId: "run_1",
        toolName: "scene.read_state",
        status: "completed",
        output: {
          sceneId: "scene_1",
          objectCount: 2
        }
      }
    });

    expect(toolResultRes.statusCode).toBe(202);

    const resumedSnapshotRes = await app.inject({
      method: "GET",
      url: "/api/v3/runs/run_1/stream"
    });
    const resumedSnapshot = parseStreamSnapshot(resumedSnapshotRes.payload);

    expect(resumedSnapshot.run.status).toBe("completed");
    expect(resumedSnapshot.events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["browser_tool.result", "run.completed"])
    );
  });
});
