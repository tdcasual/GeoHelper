export type WorkflowEngineStatus =
  | "completed"
  | "waiting_for_checkpoint"
  | "waiting_for_subagent"
  | "failed";
