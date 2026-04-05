import { describe, expect, it } from "vitest";

import { createWorkflowEngine } from "../src";

const createRun = () => ({
  id: "run_1",
  threadId: "thread_1",
  profileId: "platform_geometry_standard",
  status: "queued" as const,
  inputArtifactIds: [],
  outputArtifactIds: [],
  budget: {
    maxModelCalls: 2,
    maxToolCalls: 2,
    maxDurationMs: 60_000
  },
  createdAt: "2026-04-04T00:00:00.000Z",
  updatedAt: "2026-04-04T00:00:00.000Z"
});

describe("workflow engine", () => {
  it("executes nodes sequentially until completion", async () => {
    const engine = createWorkflowEngine({
      handlers: {
        planner: async () => ({ type: "continue" }),
        tool: async () => ({ type: "continue" }),
        synthesizer: async () => ({ type: "complete" })
      }
    });

    const result = await engine.execute({
      run: createRun(),
      workflow: {
        id: "wf_geometry_solver",
        version: 1,
        entryNodeId: "node_plan",
        nodes: [
          {
            id: "node_plan",
            kind: "planner",
            name: "Plan",
            config: {},
            next: ["node_tool"]
          },
          {
            id: "node_tool",
            kind: "tool",
            name: "Read scene state",
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
    });

    expect(result.status).toBe("completed");
    expect(result.visitedNodeIds).toEqual([
      "node_plan",
      "node_tool",
      "node_finish"
    ]);
  });

  it("follows router decisions to a dynamic next node", async () => {
    const engine = createWorkflowEngine({
      handlers: {
        planner: async () => ({ type: "continue" }),
        router: async () => ({ type: "route", nextNodeId: "node_tool_b" }),
        tool: async () => ({ type: "continue" }),
        synthesizer: async () => ({ type: "complete" })
      }
    });

    const result = await engine.execute({
      run: createRun(),
      workflow: {
        id: "wf_geometry_solver",
        version: 1,
        entryNodeId: "node_plan",
        nodes: [
          {
            id: "node_plan",
            kind: "planner",
            name: "Plan",
            config: {},
            next: ["node_route"]
          },
          {
            id: "node_route",
            kind: "router",
            name: "Choose tool",
            config: {},
            next: ["node_tool_a", "node_tool_b"]
          },
          {
            id: "node_tool_a",
            kind: "tool",
            name: "Tool A",
            config: {},
            next: ["node_finish"]
          },
          {
            id: "node_tool_b",
            kind: "tool",
            name: "Tool B",
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
    });

    expect(result.status).toBe("completed");
    expect(result.visitedNodeIds).toEqual([
      "node_plan",
      "node_route",
      "node_tool_b",
      "node_finish"
    ]);
  });

  it("pauses on a checkpoint and resumes after resolution", async () => {
    const engine = createWorkflowEngine({
      handlers: {
        planner: async () => ({ type: "continue" }),
        checkpoint: async ({ node }) => ({
          type: "checkpoint",
          checkpoint: {
            id: "checkpoint_1",
            runId: "run_1",
            nodeId: node.id,
            kind: "human_input",
            status: "pending",
            title: "Confirm construction",
            prompt: "请确认是否继续执行。",
            createdAt: "2026-04-04T00:00:00.000Z"
          }
        }),
        synthesizer: async () => ({ type: "complete" })
      }
    });

    const firstPass = await engine.execute({
      run: createRun(),
      workflow: {
        id: "wf_geometry_solver",
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
    });

    expect(firstPass.status).toBe("waiting_for_checkpoint");
    expect(firstPass.pendingCheckpoint?.id).toBe("checkpoint_1");

    const resumed = await engine.resume({
      state: firstPass.state!,
      resolution: {
        kind: "checkpoint",
        checkpointId: "checkpoint_1",
        response: {
          approved: true
        }
      }
    });

    expect(resumed.status).toBe("completed");
    expect(resumed.visitedNodeIds).toEqual([
      "node_plan",
      "node_confirm",
      "node_finish"
    ]);
  });

  it("records spawned subagents in the execution result", async () => {
    const engine = createWorkflowEngine({
      handlers: {
        subagent: async () => ({
          type: "spawn_subagent",
          childRunId: "run_child_1"
        }),
        synthesizer: async () => ({ type: "complete" })
      }
    });

    const result = await engine.execute({
      run: createRun(),
      workflow: {
        id: "wf_geometry_solver",
        version: 1,
        entryNodeId: "node_subagent",
        nodes: [
          {
            id: "node_subagent",
            kind: "subagent",
            name: "Ask reviewer agent",
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
    });

    expect(result.status).toBe("completed");
    expect(result.spawnedRunIds).toEqual(["run_child_1"]);
  });

  it("waits for an awaited subagent and resumes after child completion", async () => {
    const engine = createWorkflowEngine({
      handlers: {
        subagent: async () => ({
          type: "spawn_subagent",
          childRunId: "run_child_1",
          waitForCompletion: true
        }),
        synthesizer: async () => ({ type: "complete" })
      }
    });

    const firstPass = await engine.execute({
      run: createRun(),
      workflow: {
        id: "wf_geometry_solver",
        version: 1,
        entryNodeId: "node_subagent",
        nodes: [
          {
            id: "node_subagent",
            kind: "subagent",
            name: "Ask reviewer agent",
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
    });

    expect(firstPass.status).toBe("waiting_for_subagent");
    expect(firstPass.spawnedRunIds).toEqual(["run_child_1"]);
    expect(firstPass.state?.pendingSubagentRunId).toBe("run_child_1");

    const resumed = await engine.resume({
      state: firstPass.state!,
      resolution: {
        kind: "subagent",
        childRunId: "run_child_1",
        status: "completed",
        outputArtifactIds: ["artifact_child_output"]
      }
    });

    expect(resumed.status).toBe("completed");
    expect(resumed.visitedNodeIds).toEqual(["node_subagent", "node_finish"]);
    expect(
      resumed.events.map((event) => event.type)
    ).toEqual(
      expect.arrayContaining(["subagent.waiting", "subagent.completed", "run.completed"])
    );
  });

  it("fails fast when a node would exceed the run budget", async () => {
    const engine = createWorkflowEngine({
      handlers: {
        tool: async () => ({ type: "continue" })
      }
    });

    const result = await engine.execute({
      run: {
        ...createRun(),
        budget: {
          maxModelCalls: 2,
          maxToolCalls: 0,
          maxDurationMs: 60_000
        }
      },
      workflow: {
        id: "wf_geometry_solver",
        version: 1,
        entryNodeId: "node_tool",
        nodes: [
          {
            id: "node_tool",
            kind: "tool",
            name: "Read scene state",
            config: {},
            next: []
          }
        ]
      }
    });

    expect(result.status).toBe("failed");
    expect(result.failureReason).toBe("tool_budget_exhausted");
  });
});
