import { describe, expect, it } from "vitest";

import { createGeometryDomainPackage } from "../src";

describe("geometry domain package", () => {
  it("registers the geometry solver agent definition", () => {
    const domain = createGeometryDomainPackage();
    const agent = domain.agents.geometry_solver;

    expect(agent).toBeDefined();
    expect(agent?.workflowId).toBe("wf_geometry_solver");
    expect(agent?.toolNames).toEqual([
      "scene.read_state",
      "scene.apply_command_batch"
    ]);
    expect(agent?.evaluatorNames).toEqual(["teacher_readiness"]);
  });

  it("defines a workflow graph for the geometry solver", () => {
    const domain = createGeometryDomainPackage();
    const workflow = domain.workflows.wf_geometry_solver;

    expect(workflow.entryNodeId).toBe("node_plan_geometry");
    expect(workflow.nodes.map((node) => node.kind)).toEqual([
      "planner",
      "tool",
      "tool",
      "evaluator",
      "router",
      "checkpoint",
      "synthesizer"
    ]);
    expect(workflow.nodes.find((node) => node.id === "node_route_teacher_gate")?.next)
      .toEqual(["node_teacher_checkpoint", "node_finish_response"]);
  });

  it("publishes platform run profiles that resolve to registered workflows", () => {
    const domain = createGeometryDomainPackage();
    const standardProfile = domain.runProfiles.platform_geometry_standard;
    const quickDraftProfile = domain.runProfiles.platform_geometry_quick_draft;

    expect(standardProfile).toBeDefined();
    expect(quickDraftProfile).toBeDefined();
    expect(standardProfile.defaultBudget).toEqual(
      domain.agents.geometry_solver.defaultBudget
    );
    expect(domain.workflows[standardProfile.workflowId]?.id).toBe(
      "wf_geometry_solver"
    );
    expect(quickDraftProfile.workflowId).toBe(standardProfile.workflowId);
    expect(quickDraftProfile.defaultBudget.maxModelCalls).toBeLessThan(
      standardProfile.defaultBudget.maxModelCalls
    );
  });

  it("creates a tool_result artifact when applying a geometry command batch", async () => {
    const domain = createGeometryDomainPackage();
    const tool = domain.tools["scene.apply_command_batch"];

    const artifact = await tool.execute({
      runId: "run_1",
      sourceArtifactId: "artifact_plan_1",
      createdAt: "2026-04-04T00:00:00.000Z",
      commandBatch: {
        version: "1.0",
        scene_id: "scene_1",
        transaction_id: "tx_1",
        commands: [
          {
            id: "cmd_1",
            op: "create_point",
            args: {
              label: "A",
              x: 0,
              y: 0
            },
            depends_on: [],
            idempotency_key: "scene_1:create_point:A"
          }
        ],
        post_checks: ["确认点 A 已创建"],
        explanations: ["先创建点 A 作为构造起点。"]
      }
    });

    expect(artifact.kind).toBe("tool_result");
    expect(artifact.metadata).toMatchObject({
      domain: "geometry",
      toolName: "scene.apply_command_batch",
      sourceArtifactId: "artifact_plan_1",
      commandCount: 1
    });
    expect(artifact.inlineData).toMatchObject({
      commandBatch: {
        transaction_id: "tx_1"
      }
    });
  });

  it("evaluates teacher readiness as structured output", () => {
    const domain = createGeometryDomainPackage();
    const evaluator = domain.evaluators.teacher_readiness;

    const result = evaluator.evaluate({
      commandBatch: {
        version: "1.0",
        scene_id: "scene_1",
        transaction_id: "tx_1",
        commands: [],
        post_checks: ["检查中点是否落在线段上"],
        explanations: ["本构造适合作为课堂演示。"]
      },
      teachingOutline: ["解释中点定义", "说明构造步骤"],
      reviewChecklist: ["检查命名是否清晰"],
      blockingIssues: []
    });

    expect(result).toMatchObject({
      evaluator: "teacher_readiness",
      ready: true,
      summary: ["本构造适合作为课堂演示。"]
    });
    expect(result.score).toBeGreaterThan(0.7);
    expect(result.nextActions).toContain("execute_command_batch");
  });
});
