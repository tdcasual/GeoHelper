import { z } from "zod";

import { WorkflowNodeKindSchema } from "./workflow";

const TimestampSchema = z.string().min(1);

export const RunStatusSchema = z.enum([
  "queued",
  "planning",
  "running",
  "waiting_for_checkpoint",
  "waiting_for_tool",
  "evaluating",
  "completed",
  "failed",
  "cancelled"
]);

export const RunBudgetSchema = z.object({
  maxModelCalls: z.number().int().positive(),
  maxToolCalls: z.number().int().positive(),
  maxDurationMs: z.number().int().positive()
});

export const RunSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().min(1),
  profileId: z.string().min(1),
  status: RunStatusSchema,
  parentRunId: z.string().min(1).optional(),
  inputArtifactIds: z.array(z.string().min(1)),
  outputArtifactIds: z.array(z.string().min(1)),
  budget: RunBudgetSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema
});

export const RunEventSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  sequence: z.number().int().positive(),
  type: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  createdAt: TimestampSchema
});

export const NodeExecutionStatusSchema = z.enum([
  "queued",
  "running",
  "waiting",
  "completed",
  "failed",
  "skipped"
]);

export const NodeExecutionSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  nodeId: z.string().min(1),
  kind: WorkflowNodeKindSchema,
  status: NodeExecutionStatusSchema,
  outputArtifactIds: z.array(z.string().min(1)).default([]),
  startedAt: TimestampSchema.optional(),
  finishedAt: TimestampSchema.optional(),
  detail: z.string().min(1).optional()
});

export type RunStatus = z.infer<typeof RunStatusSchema>;
export type RunBudget = z.infer<typeof RunBudgetSchema>;
export type Run = z.infer<typeof RunSchema>;
export type RunEvent = z.infer<typeof RunEventSchema>;
export type NodeExecutionStatus = z.infer<typeof NodeExecutionStatusSchema>;
export type NodeExecution = z.infer<typeof NodeExecutionSchema>;
