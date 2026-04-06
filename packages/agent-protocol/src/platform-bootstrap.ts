import type { PlatformAgentDefinition } from "./platform-agent";
import type { PlatformRunProfile } from "./platform-run-profile";
import type { WorkflowDefinition } from "./workflow";

export type PlatformRunResolutionFailureReason =
  | "missing_profile"
  | "missing_agent"
  | "missing_workflow"
  | "missing_tool"
  | "missing_evaluator";

export interface PlatformBootstrap<
  TAgentDefinition extends PlatformAgentDefinition = PlatformAgentDefinition,
  TToolDefinition = unknown,
  TEvaluator = unknown
> {
  agents: Record<string, TAgentDefinition>;
  runProfiles: Record<string, PlatformRunProfile>;
  runProfileMap: Map<string, PlatformRunProfile>;
  workflows: Record<string, WorkflowDefinition>;
  tools: Record<string, TToolDefinition>;
  evaluators: Record<string, TEvaluator>;
}
