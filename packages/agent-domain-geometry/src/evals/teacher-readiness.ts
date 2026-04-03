import { CommandBatchSchema } from "@geohelper/protocol";
import { z } from "zod";

export const TeacherReadinessInputSchema = z.object({
  commandBatch: CommandBatchSchema,
  teachingOutline: z.array(z.string().min(1)).default([]),
  reviewChecklist: z.array(z.string().min(1)).default([]),
  blockingIssues: z.array(z.string().min(1)).default([])
});

export const TeacherReadinessEvaluationSchema = z.object({
  evaluator: z.literal("teacher_readiness"),
  ready: z.boolean(),
  score: z.number().min(0).max(1),
  summary: z.array(z.string().min(1)).min(1),
  warnings: z.array(z.string().min(1)).default([]),
  nextActions: z.array(z.string().min(1)).min(1)
});

export type TeacherReadinessInput = z.infer<
  typeof TeacherReadinessInputSchema
>;
export type TeacherReadinessEvaluation = z.infer<
  typeof TeacherReadinessEvaluationSchema
>;

export interface GeometryEvaluator<TInput, TOutput> {
  name: string;
  evaluate: (input: TInput) => TOutput;
}

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

export const evaluateTeacherReadiness = (
  input: TeacherReadinessInput
): TeacherReadinessEvaluation => {
  const parsed = TeacherReadinessInputSchema.parse(input);
  const warnings = [...parsed.blockingIssues];
  const hasTeachingNarrative =
    parsed.commandBatch.explanations.length > 0 ||
    parsed.teachingOutline.length > 0;
  const hasReviewGuard =
    parsed.commandBatch.post_checks.length > 0 ||
    parsed.reviewChecklist.length > 0;
  const summary =
    parsed.commandBatch.explanations.length > 0
      ? [parsed.commandBatch.explanations[0]!]
      : [parsed.teachingOutline[0] ?? "准备课堂讲解摘要"];
  const ready =
    warnings.length === 0 && hasTeachingNarrative && hasReviewGuard;
  const score = clamp(
    0.3 +
      (hasTeachingNarrative ? 0.25 : 0) +
      (hasReviewGuard ? 0.25 : 0) +
      (parsed.commandBatch.commands.length > 0 ? 0.2 : 0) -
      warnings.length * 0.2
  );

  return TeacherReadinessEvaluationSchema.parse({
    evaluator: "teacher_readiness",
    ready,
    score,
    summary,
    warnings,
    nextActions: ready
      ? ["execute_command_batch", "monitor_teacher_feedback"]
      : ["revise_draft", "resolve_blocking_issues"]
  });
};

export const createTeacherReadinessEvaluator = (): GeometryEvaluator<
  TeacherReadinessInput,
  TeacherReadinessEvaluation
> => ({
  name: "teacher_readiness",
  evaluate: evaluateTeacherReadiness
});
