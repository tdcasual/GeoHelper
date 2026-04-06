import type { RuntimeEvalScorecard } from "./eval-scorecard";

export interface RuntimeEvaluatorDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  evaluate: (input: TInput) => Promise<TOutput> | TOutput;
}

export interface RuntimeEvaluationInput<TInput = unknown, TOutput = unknown> {
  evaluator: RuntimeEvaluatorDefinition<TInput, TOutput>;
  input: TInput;
}

export interface RuntimeEvaluator {
  evaluate: <TInput, TOutput>(
    input: RuntimeEvaluationInput<TInput, TOutput>
  ) => Promise<RuntimeEvalScorecard>;
}

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

const readBoolean = (
  record: Record<string, unknown> | null,
  key: string
): boolean | null => {
  if (!record || typeof record[key] !== "boolean") {
    return null;
  }

  return record[key] as boolean;
};

const readNumber = (
  record: Record<string, unknown> | null,
  key: string
): number | null => {
  if (!record || typeof record[key] !== "number") {
    return null;
  }

  return record[key] as number;
};

const readStrings = (
  record: Record<string, unknown> | null,
  key: string
): string[] => {
  if (!record || !Array.isArray(record[key])) {
    return [];
  }

  return (record[key] as unknown[]).filter(
    (value): value is string => typeof value === "string"
  );
};

const normalizeScorecard = (
  evaluatorName: string,
  output: unknown
): RuntimeEvalScorecard => {
  const record = asRecord(output);
  const passed =
    readBoolean(record, "passed") ??
    readBoolean(record, "ready") ??
    (readNumber(record, "score") ?? 0) >= 0.5;
  const score = readNumber(record, "score") ?? (passed ? 1 : 0);
  const warnings = readStrings(record, "warnings");
  const nextActions = readStrings(record, "nextActions");
  const summary = readStrings(record, "summary");

  return {
    evaluator:
      (record?.evaluator as string | undefined) ??
      evaluatorName,
    status: passed ? "passed" : "failed",
    passed,
    score,
    summary:
      summary.length > 0
        ? summary
        : [`Evaluator ${evaluatorName} completed.`],
    warnings,
    nextActions:
      nextActions.length > 0
        ? nextActions
        : passed
          ? ["continue"]
          : ["review"]
  };
};

export const createRuntimeEvaluator = (): RuntimeEvaluator => ({
  evaluate: async ({ evaluator, input }) =>
    normalizeScorecard(evaluator.name, await evaluator.evaluate(input))
});
