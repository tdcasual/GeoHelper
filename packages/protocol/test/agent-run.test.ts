import { describe, expect, it } from "vitest";

import { AgentRunEnvelopeSchema } from "../src/agent-run";

describe("AgentRunEnvelopeSchema", () => {
  it("accepts reviewable geometry agent runs", () => {
    expect(() =>
      AgentRunEnvelopeSchema.parse({
        run: {
          id: "run_1",
          target: "gateway",
          mode: "official",
          status: "success",
          iterationCount: 1,
          startedAt: "2026-03-17T10:00:00.000Z",
          finishedAt: "2026-03-17T10:00:01.000Z",
          totalDurationMs: 1000
        },
        draft: {
          normalizedIntent: "构造三角形外接圆",
          assumptions: ["已知三角形 ABC"],
          constructionPlan: ["先构造边", "再求垂直平分线"],
          namingPlan: ["A", "B", "C", "O"],
          commandBatchDraft: {
            version: "1.0",
            scene_id: "scene_1",
            transaction_id: "tx_1",
            commands: [],
            explanations: ["已生成草案"],
            post_checks: []
          },
          teachingOutline: ["先画三角形", "再说明圆心"],
          reviewChecklist: ["检查圆心是否为垂直平分线交点"]
        },
        reviews: [],
        evidence: {
          preflight: {
            status: "passed",
            issues: [],
            referencedLabels: ["A", "B", "C", "O"],
            generatedLabels: ["A", "B", "C", "O"]
          }
        },
        teacherPacket: {
          summary: ["已构造三角形外接圆草案"],
          warnings: [],
          uncertainties: [],
          nextActions: ["检查圆心位置"],
          canvasLinks: []
        },
        telemetry: {
          upstreamCallCount: 2,
          degraded: false,
          stages: []
        }
      })
    ).not.toThrow();
  });
});
