import {
  type AgentRunEnvelope,
  type AgentRunStage,
  type GeometryDraftPackage,
  type GeometryPreflightEvidence,
  type GeometryReviewReport,
  type GeometryTeacherPacket
} from "@geohelper/protocol";

import { type GeometryReviewerInput } from "./geometry-reviewer";
import { type GeometryReviserInput } from "./geometry-reviser";
import { type CompileInput } from "./litellm-client";

export interface AgentWorkflowDeps {
  author: (input: CompileInput) => Promise<GeometryDraftPackage>;
  reviewer: (input: GeometryReviewerInput) => Promise<GeometryReviewReport>;
  reviser: (input: GeometryReviserInput) => Promise<GeometryDraftPackage>;
  preflight: (draft: GeometryDraftPackage) => Promise<GeometryPreflightEvidence>;
  getUpstreamCallCount?: () => number;
  buildRunId?: () => string;
  now?: () => number;
}

const defaultNow = (): number => Date.now();
const defaultRunId = (): string => `run_${Date.now()}`;

const measure = async <T>(
  stages: AgentRunStage[],
  name: string,
  fn: () => Promise<T>,
  now: () => number
): Promise<T> => {
  const startedAt = now();

  try {
    const value = await fn();
    stages.push({
      name,
      status: "ok",
      durationMs: Math.max(0, now() - startedAt)
    });
    return value;
  } catch (error) {
    stages.push({
      name,
      status: "error",
      durationMs: Math.max(0, now() - startedAt),
      detail: error instanceof Error ? error.message : "unknown_error"
    });
    throw error;
  }
};

const buildTeacherPacket = (input: {
  draft: GeometryDraftPackage;
  reviews: GeometryReviewReport[];
  preflight: GeometryPreflightEvidence;
  degraded: boolean;
}): GeometryTeacherPacket => {
  const lastReview = input.reviews.at(-1);
  const reviewIssues = [
    ...(lastReview?.correctnessIssues ?? []),
    ...(lastReview?.ambiguityIssues ?? []),
    ...(lastReview?.namingIssues ?? []),
    ...(lastReview?.teachingIssues ?? [])
  ];
  const summary =
    lastReview?.summary.length && lastReview.summary.length > 0
      ? lastReview.summary
      : input.draft.commandBatchDraft.explanations.length > 0
        ? input.draft.commandBatchDraft.explanations
        : [input.draft.normalizedIntent];

  return {
    summary,
    warnings: [...reviewIssues, ...input.preflight.issues],
    uncertainties: lastReview?.uncertaintyItems ?? [],
    nextActions: input.degraded
      ? ["检查待确认条件", "根据当前草案继续修正"]
      : ["执行到画布", "继续课堂讲解或修正"],
    canvasLinks: (lastReview?.uncertaintyItems ?? []).map((item) => ({
      id: `link_${item.id}`,
      scope: "uncertainty",
      text: item.label,
      objectLabels:
        input.preflight.generatedLabels.length > 0
          ? input.preflight.generatedLabels
          : input.draft.namingPlan,
      uncertaintyId: item.id
    }))
  };
};

export const createAgentWorkflow =
  (deps: AgentWorkflowDeps) =>
  async (input: CompileInput): Promise<AgentRunEnvelope> => {
    const now = deps.now ?? defaultNow;
    const buildRunId = deps.buildRunId ?? defaultRunId;
    const startedAt = now();
    const stages: AgentRunStage[] = [];
    const reviews: GeometryReviewReport[] = [];
    let draft = await measure(stages, "author", () => deps.author(input), now);
    let degraded = false;
    let revisionCount = 0;

    for (let reviewIndex = 0; reviewIndex < 2; reviewIndex += 1) {
      const review = await measure(
        stages,
        `reviewer_${reviewIndex + 1}`,
        () =>
          deps.reviewer({
            draft,
            compileInput: input
          }),
        now
      );
      reviews.push(review);

      if (review.verdict === "approve") {
        break;
      }

      if (reviewIndex === 1) {
        degraded = true;
        break;
      }

      draft = await measure(
        stages,
        `reviser_${reviewIndex + 1}`,
        () =>
          deps.reviser({
            draft,
            reviewReport: review,
            compileInput: input
          }),
        now
      );
      revisionCount += 1;
    }

    const preflight = await measure(
      stages,
      "preflight",
      () => deps.preflight(draft),
      now
    );

    const teacherPacket = buildTeacherPacket({
      draft,
      reviews,
      preflight,
      degraded
    });
    const finishedAt = now();
    const lastReview = reviews.at(-1);
    const status =
      preflight.status === "failed"
        ? "needs_review"
        : degraded
          ? "degraded"
          : lastReview?.verdict === "approve"
            ? "success"
            : "needs_review";

    return {
      run: {
        id: buildRunId(),
        target: "gateway",
        mode: input.mode,
        status,
        iterationCount: 1 + revisionCount,
        startedAt: new Date(startedAt).toISOString(),
        finishedAt: new Date(finishedAt).toISOString(),
        totalDurationMs: Math.max(0, finishedAt - startedAt)
      },
      draft,
      reviews,
      evidence: {
        preflight
      },
      teacherPacket,
      telemetry: {
        upstreamCallCount: deps.getUpstreamCallCount?.() ?? 0,
        degraded,
        stages,
        retryCount: revisionCount
      }
    };
  };
