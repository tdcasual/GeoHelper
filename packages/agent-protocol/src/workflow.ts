import { z } from "zod";

export const WorkflowNodeKindSchema = z.enum([
  "planner",
  "model",
  "tool",
  "router",
  "checkpoint",
  "evaluator",
  "subagent",
  "synthesizer"
]);

export const WorkflowNodeSchema = z.object({
  id: z.string().min(1),
  kind: WorkflowNodeKindSchema,
  name: z.string().min(1),
  config: z.record(z.string(), z.unknown()).default({}),
  next: z.array(z.string().min(1)).default([])
});

export const WorkflowDefinitionSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  entryNodeId: z.string().min(1),
  nodes: z.array(WorkflowNodeSchema).min(1)
});

export type WorkflowNodeKind = z.infer<typeof WorkflowNodeKindSchema>;
export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;
