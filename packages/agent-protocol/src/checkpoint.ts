import { z } from "zod";

const TimestampSchema = z.string().min(1);

export const CheckpointKindSchema = z.enum([
  "human_input",
  "tool_result",
  "approval"
]);

export const CheckpointStatusSchema = z.enum([
  "pending",
  "resolved",
  "expired",
  "cancelled"
]);

export const CheckpointSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  nodeId: z.string().min(1),
  kind: CheckpointKindSchema,
  status: CheckpointStatusSchema,
  title: z.string().min(1),
  prompt: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
  response: z.unknown().optional(),
  createdAt: TimestampSchema,
  resolvedAt: TimestampSchema.optional()
});

export type CheckpointKind = z.infer<typeof CheckpointKindSchema>;
export type CheckpointStatus = z.infer<typeof CheckpointStatusSchema>;
export type Checkpoint = z.infer<typeof CheckpointSchema>;
