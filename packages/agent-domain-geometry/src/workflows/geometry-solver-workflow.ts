import type { WorkflowDefinition } from "@geohelper/agent-protocol";

export const createGeometrySolverWorkflow = (): WorkflowDefinition => ({
  id: "wf_geometry_solver",
  version: 1,
  entryNodeId: "node_plan_geometry",
  nodes: [
    {
      id: "node_plan_geometry",
      kind: "planner",
      name: "Plan geometry construction",
      config: {
        domain: "geometry"
      },
      next: ["node_read_scene"]
    },
    {
      id: "node_read_scene",
      kind: "tool",
      name: "Read scene state",
      config: {
        toolName: "scene.read_state"
      },
      next: ["node_apply_command_batch"]
    },
    {
      id: "node_apply_command_batch",
      kind: "tool",
      name: "Apply command batch",
      config: {
        toolName: "scene.apply_command_batch"
      },
      next: ["node_teacher_readiness"]
    },
    {
      id: "node_teacher_readiness",
      kind: "evaluator",
      name: "Evaluate teacher readiness",
      config: {
        evaluatorName: "teacher_readiness"
      },
      next: ["node_route_teacher_gate"]
    },
    {
      id: "node_route_teacher_gate",
      kind: "router",
      name: "Route teacher gate",
      config: {
        onReady: "node_finish_response",
        onNeedsCheckpoint: "node_teacher_checkpoint"
      },
      next: ["node_teacher_checkpoint", "node_finish_response"]
    },
    {
      id: "node_teacher_checkpoint",
      kind: "checkpoint",
      name: "Request teacher confirmation",
      config: {
        checkpointKind: "human_input"
      },
      next: ["node_finish_response"]
    },
    {
      id: "node_finish_response",
      kind: "synthesizer",
      name: "Synthesize geometry response",
      config: {
        artifactKind: "response"
      },
      next: []
    }
  ]
});
