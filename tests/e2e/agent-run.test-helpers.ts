import { createAgentRunEnvelopeFixture } from "../../apps/web/src/test-utils/agent-run-fixture";

interface AgentRunTestUncertainty {
  id: string;
  label: string;
  followUpPrompt: string;
  reviewStatus: "pending" | "confirmed" | "needs_fix";
}

interface AgentRunTestCanvasLink {
  id: string;
  scope: "summary" | "warning" | "uncertainty";
  text: string;
  objectLabels: string[];
  uncertaintyId?: string;
}

interface AgentRunPayloadInput {
  traceId: string;
  runId: string;
  summary: string[];
  status?: "success" | "needs_review" | "failed" | "degraded";
  warnings?: string[];
  uncertainties?: AgentRunTestUncertainty[];
  canvasLinks?: AgentRunTestCanvasLink[];
  nextActions?: string[];
  explanations?: string[];
  postChecks?: string[];
}

const toFixtureLabels = (input: AgentRunPayloadInput): string[] => {
  const labels = input.canvasLinks?.flatMap((item) => item.objectLabels) ?? [];
  return labels.length > 0 ? [...new Set(labels)] : ["A", "B", "C", "D"];
};

export const createAgentRunPayload = (input: AgentRunPayloadInput) => {
  const uncertainties = input.uncertainties ?? [];
  const labels = toFixtureLabels(input);

  return {
    trace_id: input.traceId,
    agent_run: createAgentRunEnvelopeFixture({
      run: {
        id: input.runId,
        mode: "byok",
        status: input.status ?? "success"
      },
      draft: {
        normalizedIntent: "画一个三角形",
        assumptions: [],
        constructionPlan: ["先作三角形", "再检查待确认条件"],
        namingPlan: labels,
        commandBatchDraft: {
          version: "1.0",
          scene_id: "scene_1",
          transaction_id: `tx_${input.runId}`,
          commands: [],
          post_checks: input.postChecks ?? [],
          explanations: input.explanations ?? input.summary
        },
        teachingOutline: ["说明作图顺序"],
        reviewChecklist: ["检查待确认条件"]
      },
      reviews: [
        {
          reviewer: "geometry-reviewer",
          verdict: "approve",
          summary: input.summary,
          correctnessIssues: [],
          ambiguityIssues: [],
          namingIssues: [],
          teachingIssues: [],
          repairInstructions: [],
          uncertaintyItems: uncertainties
        }
      ],
      evidence: {
        preflight: {
          status: "passed",
          issues: [],
          referencedLabels: labels,
          generatedLabels: labels,
          dependencySummary: {
            commandCount: 0,
            edgeCount: 0
          }
        }
      },
      teacherPacket: {
        summary: input.summary,
        warnings: input.warnings ?? [],
        uncertainties,
        nextActions: input.nextActions ?? ["继续修正"],
        canvasLinks: input.canvasLinks ?? []
      },
      telemetry: {
        upstreamCallCount: 2,
        degraded: input.status === "degraded",
        retryCount: 0,
        stages: [
          {
            name: "author",
            status: "ok",
            durationMs: 8
          }
        ]
      }
    })
  };
};
