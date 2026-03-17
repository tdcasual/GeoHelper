import {
  type GeometryDraftPackage,
  type GeometryReviewReport
} from "@geohelper/protocol";

import { type CompileInput, type RequestCommandBatch } from "../../src/services/litellm-client";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const createGeometryDraftFixture = (
  overrides: Partial<GeometryDraftPackage> = {}
): GeometryDraftPackage => {
  const baseDraft: GeometryDraftPackage = {
    normalizedIntent: "构造中点",
    assumptions: [],
    constructionPlan: ["先取线段 AB", "再取中点 M"],
    namingPlan: ["A", "B", "M"],
    commandBatchDraft: {
      version: "1.0",
      scene_id: "scene_1",
      transaction_id: "tx_1",
      commands: [],
      explanations: ["草案"],
      post_checks: []
    },
    teachingOutline: ["说明中点定义"],
    reviewChecklist: ["检查 M 是否在线段 AB 上"]
  };

  return {
    ...baseDraft,
    ...overrides,
    commandBatchDraft: {
      ...baseDraft.commandBatchDraft,
      ...overrides.commandBatchDraft
    }
  };
};

export const createGeometryReviewFixture = (
  overrides: Partial<GeometryReviewReport> = {}
): GeometryReviewReport => ({
  reviewer: "geometry-reviewer",
  verdict: "approve",
  summary: ["草案可执行"],
  correctnessIssues: [],
  ambiguityIssues: [],
  namingIssues: [],
  teachingIssues: [],
  repairInstructions: [],
  uncertaintyItems: [],
  ...overrides
});

export const createGeometryAgentResponder = (
  options: {
    drafts?: GeometryDraftPackage[];
    reviews?: GeometryReviewReport[];
    onRequest?: (input: CompileInput) => void | Promise<void>;
  } = {}
): RequestCommandBatch => {
  const drafts = options.drafts ?? [createGeometryDraftFixture()];
  const reviews = options.reviews ?? [createGeometryReviewFixture()];
  let draftIndex = 0;
  let reviewIndex = 0;

  return async (input) => {
    await options.onRequest?.(input);

    if (input.systemPrompt?.includes("GeometryDraftPackage")) {
      const draft = drafts[Math.min(draftIndex, drafts.length - 1)] ?? drafts[0];
      draftIndex += 1;
      return clone(draft);
    }

    const review = reviews[Math.min(reviewIndex, reviews.length - 1)] ?? reviews[0];
    reviewIndex += 1;
    return clone(review);
  };
};
