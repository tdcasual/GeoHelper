import { z } from "zod";

import { RunBudgetSchema } from "./run";

export const PlatformRunProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  agentId: z.string().min(1),
  workflowId: z.string().min(1),
  defaultBudget: RunBudgetSchema
});

export type PlatformRunProfile = z.infer<typeof PlatformRunProfileSchema>;
