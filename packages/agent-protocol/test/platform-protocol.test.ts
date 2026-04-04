import { describe, expect, it } from "vitest";

import {
  ArtifactSchema,
  CheckpointSchema,
  MemoryEntrySchema,
  PlatformRunProfileSchema,
  RunEventSchema,
  RunSchema,
  WorkflowDefinitionSchema,
  WorkflowNodeSchema
} from "../src";

describe("platform agent protocol", () => {
  it("accepts a minimal run ledger document", () => {
    expect(() =>
      RunSchema.parse({
        id: "run_1",
        threadId: "thread_1",
        workflowId: "wf_geometry_solver",
        agentId: "geometry_solver",
        status: "queued",
        inputArtifactIds: ["artifact_input_1"],
        outputArtifactIds: [],
        budget: {
          maxModelCalls: 4,
          maxToolCalls: 8,
          maxDurationMs: 60_000
        },
        createdAt: "2026-04-04T00:00:00.000Z",
        updatedAt: "2026-04-04T00:00:00.000Z"
      })
    ).not.toThrow();

    expect(() =>
      WorkflowNodeSchema.parse({
        id: "node_plan",
        kind: "planner",
        name: "Plan next actions",
        next: ["node_tool"]
      })
    ).not.toThrow();

    expect(() =>
      WorkflowDefinitionSchema.parse({
        id: "wf_geometry_solver",
        version: 1,
        entryNodeId: "node_plan",
        nodes: [
          {
            id: "node_plan",
            kind: "planner",
            name: "Plan next actions",
            next: ["node_tool"]
          },
          {
            id: "node_tool",
            kind: "tool",
            name: "Read scene state",
            next: []
          }
        ]
      })
    ).not.toThrow();

    expect(() =>
      ArtifactSchema.parse({
        id: "artifact_input_1",
        runId: "run_1",
        kind: "input",
        contentType: "application/json",
        storage: "inline",
        inlineData: {
          prompt: "构造角平分线"
        },
        createdAt: "2026-04-04T00:00:00.000Z"
      })
    ).not.toThrow();

    expect(() =>
      RunEventSchema.parse({
        id: "event_1",
        runId: "run_1",
        sequence: 1,
        type: "run.created",
        payload: {
          status: "queued"
        },
        createdAt: "2026-04-04T00:00:00.000Z"
      })
    ).not.toThrow();

    expect(() =>
      CheckpointSchema.parse({
        id: "checkpoint_1",
        runId: "run_1",
        nodeId: "node_review",
        kind: "human_input",
        status: "pending",
        title: "Confirm construction",
        prompt: "请确认是否继续执行这轮构图。",
        createdAt: "2026-04-04T00:00:00.000Z"
      })
    ).not.toThrow();

    expect(() =>
      MemoryEntrySchema.parse({
        id: "memory_1",
        scope: "thread",
        scopeId: "thread_1",
        key: "teacher_preference",
        value: {
          prefersConciseSummary: true
        },
        sourceRunId: "run_1",
        sourceArtifactId: "artifact_input_1",
        createdAt: "2026-04-04T00:00:00.000Z"
      })
    ).not.toThrow();

    expect(() =>
      PlatformRunProfileSchema.parse({
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
      })
    ).not.toThrow();
  });
});
