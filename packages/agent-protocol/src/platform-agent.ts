import type { RunBudget } from "./run";

export interface PlatformAgentDefinition {
  id: string;
  name: string;
  description: string;
  workflowId: string;
  toolNames: string[];
  evaluatorNames: string[];
  defaultBudget: RunBudget;
}
