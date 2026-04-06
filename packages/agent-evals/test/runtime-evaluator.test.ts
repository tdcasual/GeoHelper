import type { Artifact } from "@geohelper/agent-protocol";
import { describe, expect, it } from "vitest";

import {
  applyEvalPolicyGate,
  createEvaluationArtifact,
  createRuntimeEvaluator
} from "../src";

describe("runtime evaluator", () => {
  it("normalizes domain evaluator output into a runtime scorecard", async () => {
    const runtimeEvaluator = createRuntimeEvaluator();

    const scorecard = await runtimeEvaluator.evaluate({
      evaluator: {
        name: "teacher_readiness",
        evaluate: () => ({
          evaluator: "teacher_readiness",
          ready: false,
          score: 0.42,
          summary: ["Needs manual review."],
          warnings: ["missing_outline"],
          nextActions: ["revise_draft"]
        })
      },
      input: {}
    });

    expect(scorecard).toEqual({
      evaluator: "teacher_readiness",
      status: "failed",
      passed: false,
      score: 0.42,
      summary: ["Needs manual review."],
      warnings: ["missing_outline"],
      nextActions: ["revise_draft"]
    });
  });

  it("creates checkpoint gate decisions for failed scorecards when configured", () => {
    const gate = applyEvalPolicyGate(
      {
        evaluator: "teacher_readiness",
        status: "failed",
        passed: false,
        score: 0.38,
        summary: ["Needs approval."],
        warnings: ["missing_outline"],
        nextActions: ["request_teacher_review"]
      },
      {
        checkpointOnFailure: true,
        checkpointTitle: "Review evaluation",
        checkpointPrompt: "Confirm whether the run may continue."
      }
    );

    expect(gate).toEqual({
      action: "checkpoint",
      title: "Review evaluation",
      prompt: "Confirm whether the run may continue."
    });
  });

  it("creates evaluation artifacts with normalized metadata", () => {
    const artifact = createEvaluationArtifact({
      artifactId: "artifact_eval_1",
      runId: "run_1",
      scorecard: {
        evaluator: "teacher_readiness",
        status: "failed",
        passed: false,
        score: 0.4,
        summary: ["Needs review."],
        warnings: ["missing_outline"],
        nextActions: ["request_teacher_review"]
      },
      createdAt: "2026-04-06T00:00:00.000Z"
    });

    expect(artifact).toEqual<Artifact>({
      id: "artifact_eval_1",
      runId: "run_1",
      kind: "evaluation",
      contentType: "application/json",
      storage: "inline",
      inlineData: {
        evaluator: "teacher_readiness",
        status: "failed",
        passed: false,
        score: 0.4,
        summary: ["Needs review."],
        warnings: ["missing_outline"],
        nextActions: ["request_teacher_review"]
      },
      metadata: {
        evaluator: "teacher_readiness",
        status: "failed",
        passed: false
      },
      createdAt: "2026-04-06T00:00:00.000Z"
    });
  });
});
