import { describe, expect, it } from "vitest";

import { createPlatformRuntimeContext } from "../src";

const createRun = (profileId = "platform_geometry_standard") => ({
  id: "run_1",
  threadId: "thread_1",
  profileId,
  status: "queued" as const,
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

const createTestBootstrap = () => ({
  agents: {
    geometry_solver: {
      id: "geometry_solver",
      name: "Geometry Solver",
      description: "Test geometry solver",
      workflowId: "wf_geometry_solver",
      toolNames: ["scene.read_state", "scene.apply_command_batch"],
      evaluatorNames: ["teacher_readiness"],
      defaultBudget: {
        maxModelCalls: 6,
        maxToolCalls: 8,
        maxDurationMs: 120000
      }
    }
  },
  runProfiles: {
    platform_geometry_standard: {
      id: "platform_geometry_standard",
      name: "几何解题",
      description: "标准几何解题链路",
      agentId: "geometry_solver",
      workflowId: "wf_geometry_solver",
      defaultBudget: {
        maxModelCalls: 6,
        maxToolCalls: 8,
        maxDurationMs: 120000
      }
    }
  },
  runProfileMap: new Map([
    [
      "platform_geometry_standard",
      {
        id: "platform_geometry_standard",
        name: "几何解题",
        description: "标准几何解题链路",
        agentId: "geometry_solver",
        workflowId: "wf_geometry_solver",
        defaultBudget: {
          maxModelCalls: 6,
          maxToolCalls: 8,
          maxDurationMs: 120000
        }
      }
    ]
  ]),
  workflows: {
    wf_geometry_solver: {
      id: "wf_geometry_solver",
      version: 1,
      entryNodeId: "node_plan_geometry",
      nodes: [
        {
          id: "node_plan_geometry",
          kind: "planner" as const,
          name: "Plan geometry construction",
          config: {},
          next: ["node_read_scene"]
        },
        {
          id: "node_read_scene",
          kind: "tool" as const,
          name: "Read scene state",
          config: {
            toolName: "scene.read_state"
          },
          next: ["node_apply_command_batch"]
        },
        {
          id: "node_apply_command_batch",
          kind: "tool" as const,
          name: "Apply command batch",
          config: {
            toolName: "scene.apply_command_batch"
          },
          next: ["node_teacher_readiness"]
        },
        {
          id: "node_teacher_readiness",
          kind: "evaluator" as const,
          name: "Evaluate teacher readiness",
          config: {
            evaluatorName: "teacher_readiness"
          },
          next: ["node_finish_response"]
        },
        {
          id: "node_finish_response",
          kind: "synthesizer" as const,
          name: "Synthesize geometry response",
          config: {},
          next: []
        }
      ]
    }
  },
  tools: {
    "scene.read_state": {
      name: "scene.read_state"
    },
    "scene.apply_command_batch": {
      name: "scene.apply_command_batch"
    }
  },
  evaluators: {
    teacher_readiness: {
      name: "teacher_readiness"
    }
  }
});

describe("platform runtime context", () => {
  it("resolves a run into its profile, agent, workflow, tools, and evaluators", () => {
    const bootstrap = createTestBootstrap();
    const runtime = createPlatformRuntimeContext(bootstrap);
    const resolution = runtime.resolveRun(createRun());

    expect(runtime.bootstrap).toBe(bootstrap);
    expect(runtime.runProfiles.get("platform_geometry_standard")).toEqual(
      bootstrap.runProfiles.platform_geometry_standard
    );
    expect(resolution.ok).toBe(true);

    if (!resolution.ok) {
      throw new Error(`Expected run resolution to succeed, got ${resolution.reason}`);
    }

    expect(resolution.value.profile.id).toBe("platform_geometry_standard");
    expect(resolution.value.agent.id).toBe("geometry_solver");
    expect(resolution.value.workflow.id).toBe("wf_geometry_solver");
    expect(resolution.value.tools.map((tool) => tool.name)).toEqual([
      "scene.read_state",
      "scene.apply_command_batch"
    ]);
    expect(resolution.value.evaluators.map((evaluator) => evaluator.name)).toEqual([
      "teacher_readiness"
    ]);
  });

  it("fails when an agent tool is missing from the runtime registry", () => {
    const bootstrap = createTestBootstrap();
    const runtime = createPlatformRuntimeContext({
      ...bootstrap,
      tools: {
        "scene.apply_command_batch": bootstrap.tools["scene.apply_command_batch"]
      }
    });

    expect(runtime.resolveRun(createRun())).toMatchObject({
      ok: false,
      reason: "missing_tool",
      missingName: "scene.read_state"
    });
  });

  it("fails when a workflow evaluator is missing from the runtime registry", () => {
    const bootstrap = createTestBootstrap();
    const runtime = createPlatformRuntimeContext({
      ...bootstrap,
      evaluators: {}
    });

    expect(runtime.resolveRun(createRun())).toMatchObject({
      ok: false,
      reason: "missing_evaluator",
      missingName: "teacher_readiness"
    });
  });
});
