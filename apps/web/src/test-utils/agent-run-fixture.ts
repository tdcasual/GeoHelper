import type { AgentRunEnvelope } from "@geohelper/protocol";

interface AgentRunFixtureOverride {
  run?: Partial<AgentRunEnvelope["run"]>;
  draft?: Partial<AgentRunEnvelope["draft"]>;
  evidence?: Partial<AgentRunEnvelope["evidence"]>;
  teacherPacket?: Partial<AgentRunEnvelope["teacherPacket"]>;
  telemetry?: Partial<AgentRunEnvelope["telemetry"]>;
  reviews?: AgentRunEnvelope["reviews"];
}

export const createAgentRunEnvelopeFixture = (
  override: AgentRunFixtureOverride = {}
): AgentRunEnvelope => {
  const base: AgentRunEnvelope = {
    run: {
      id: "run_fixture",
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
      constructionPlan: ["先构造三角形", "再作垂直平分线"],
      namingPlan: ["A", "B", "C", "O"],
      commandBatchDraft: {
        version: "1.0",
        scene_id: "scene_fixture",
        transaction_id: "tx_fixture",
        commands: [
          {
            id: "cmd_point_a",
            op: "create_point",
            args: {
              name: "A",
              x: 0,
              y: 0
            },
            depends_on: [],
            idempotency_key: "cmd_point_a"
          }
        ],
        post_checks: ["待确认：圆心 O 是否位于垂直平分线交点"],
        explanations: ["已创建三角形 ABC", "已生成外接圆草案"]
      },
      teachingOutline: ["先画三角形", "再说明圆心位置"],
      reviewChecklist: ["检查圆心是否正确"]
    },
    reviews: [
      {
        reviewer: "geometry-reviewer",
        verdict: "approve",
        summary: ["草案可继续执行"],
        correctnessIssues: [],
        ambiguityIssues: [],
        namingIssues: [],
        teachingIssues: [],
        repairInstructions: [],
        uncertaintyItems: [
          {
            id: "unc_o",
            label: "圆心 O 是否位于垂直平分线交点",
            followUpPrompt: "请确认圆心 O 是否位于垂直平分线交点。",
            reviewStatus: "pending"
          }
        ]
      }
    ],
    evidence: {
      preflight: {
        status: "passed",
        issues: [],
        referencedLabels: ["A", "B", "C", "O"],
        generatedLabels: ["A", "B", "C", "O"],
        dependencySummary: {
          commandCount: 1,
          edgeCount: 0
        }
      }
    },
    teacherPacket: {
      summary: ["已创建三角形 ABC", "已生成外接圆草案"],
      warnings: ["注意：请检查圆心位置"],
      uncertainties: [
        {
          id: "unc_o",
          label: "圆心 O 是否位于垂直平分线交点",
          followUpPrompt: "请确认圆心 O 是否位于垂直平分线交点。",
          reviewStatus: "pending"
        }
      ],
      nextActions: ["执行到画布", "继续课堂讲解或修正"],
      canvasLinks: [
        {
          id: "link_unc_o",
          scope: "uncertainty",
          text: "圆心 O 是否位于垂直平分线交点",
          objectLabels: ["O", "A", "B", "C"],
          uncertaintyId: "unc_o"
        }
      ]
    },
    telemetry: {
      upstreamCallCount: 2,
      degraded: false,
      retryCount: 0,
      stages: [
        {
          name: "author",
          status: "ok",
          durationMs: 280
        },
        {
          name: "reviewer_1",
          status: "ok",
          durationMs: 120
        },
        {
          name: "preflight",
          status: "ok",
          durationMs: 40
        }
      ]
    }
  };

  return {
    ...base,
    ...override,
    run: {
      ...base.run,
      ...override.run
    },
    draft: {
      ...base.draft,
      ...override.draft
    },
    evidence: {
      ...base.evidence,
      ...override.evidence
    },
    teacherPacket: {
      ...base.teacherPacket,
      ...override.teacherPacket
    },
    telemetry: {
      ...base.telemetry,
      ...override.telemetry
    },
    reviews: override.reviews ?? base.reviews
  };
};
