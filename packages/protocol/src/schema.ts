import { z } from "zod";

export const CommandOpSchema = z.enum([
  "create_point",
  "create_line",
  "create_conic",
  "set_property",
  "create_slider",
  "create_3d_object",
  "run_cas",
  "run_probability_tool"
]);

export const CommandSchema = z.object({
  id: z.string().min(1),
  op: CommandOpSchema,
  args: z.record(z.string(), z.unknown()),
  depends_on: z.array(z.string()),
  idempotency_key: z.string().min(1),
  on_fail: z.enum(["rollback", "skip", "stop"]).optional()
});

export const CommandBatchSchema = z.object({
  version: z.string().min(1),
  scene_id: z.string().min(1),
  transaction_id: z.string().min(1),
  commands: z.array(CommandSchema),
  post_checks: z.array(z.string()),
  explanations: z.array(z.string())
});

export type CommandOp = z.infer<typeof CommandOpSchema>;
export type Command = z.infer<typeof CommandSchema>;
export type CommandBatch = z.infer<typeof CommandBatchSchema>;
