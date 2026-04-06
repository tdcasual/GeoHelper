import type {
  PlatformAgentDefinition,
  PlatformRunProfile,
  WorkflowDefinition
} from "@geohelper/agent-protocol";

export interface DomainPackage<
  TAgentDefinition extends PlatformAgentDefinition = PlatformAgentDefinition,
  TToolDefinition = unknown,
  TEvaluator = unknown
> {
  id: string;
  agents: Record<string, TAgentDefinition>;
  runProfiles: Record<string, PlatformRunProfile>;
  workflows: Record<string, WorkflowDefinition>;
  tools: Record<string, TToolDefinition>;
  evaluators: Record<string, TEvaluator>;
}
