import type { RuntimeEvalScorecard } from "./eval-scorecard";

export interface EvalPolicyGateOptions {
  checkpointOnFailure?: boolean;
  minimumScore?: number;
  checkpointTitle?: string;
  checkpointPrompt?: string;
}

export type EvalPolicyGateDecision =
  | {
      action: "continue";
    }
  | {
      action: "checkpoint";
      title: string;
      prompt: string;
    };

export const applyEvalPolicyGate = (
  scorecard: RuntimeEvalScorecard,
  options: EvalPolicyGateOptions = {}
): EvalPolicyGateDecision => {
  const minimumScore = options.minimumScore ?? 0;
  const failed = !scorecard.passed || scorecard.score < minimumScore;

  if (!failed || !options.checkpointOnFailure) {
    return {
      action: "continue"
    };
  }

  return {
    action: "checkpoint",
    title: options.checkpointTitle ?? `Review ${scorecard.evaluator}`,
    prompt:
      options.checkpointPrompt ??
      `The evaluator ${scorecard.evaluator} failed. Confirm whether the run may continue.`
  };
};
