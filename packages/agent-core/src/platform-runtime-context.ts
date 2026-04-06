import type {
  PlatformAgentDefinition,
  PlatformBootstrap,
  PlatformRunProfile,
  PlatformRunResolutionFailureReason,
  Run,
  WorkflowDefinition
} from "@geohelper/agent-protocol";

const unique = (values: string[]): string[] => [...new Set(values)];

const getWorkflowToolNames = (workflow: WorkflowDefinition): string[] =>
  workflow.nodes.flatMap((node) => {
    if (node.kind !== "tool") {
      return [];
    }

    const toolName =
      typeof node.config.toolName === "string" ? node.config.toolName : node.id;

    return [toolName];
  });

const getWorkflowEvaluatorNames = (workflow: WorkflowDefinition): string[] =>
  workflow.nodes.flatMap((node) => {
    if (node.kind !== "evaluator") {
      return [];
    }

    const evaluatorName =
      typeof node.config.evaluatorName === "string"
        ? node.config.evaluatorName
        : node.id;

    return [evaluatorName];
  });

export interface ResolvedPlatformRunContext<
  TAgentDefinition extends PlatformAgentDefinition,
  TToolDefinition,
  TEvaluator
> {
  profile: PlatformRunProfile;
  agent: TAgentDefinition;
  workflow: WorkflowDefinition;
  tools: TToolDefinition[];
  evaluators: TEvaluator[];
}

export type PlatformRunResolution<
  TAgentDefinition extends PlatformAgentDefinition,
  TToolDefinition,
  TEvaluator
> =
  | {
      ok: true;
      value: ResolvedPlatformRunContext<
        TAgentDefinition,
        TToolDefinition,
        TEvaluator
      >;
    }
  | {
      ok: false;
      reason: PlatformRunResolutionFailureReason;
      missingName?: string;
    };

export interface PlatformRuntimeContext<
  TAgentDefinition extends PlatformAgentDefinition,
  TToolDefinition,
  TEvaluator
> {
  bootstrap: PlatformBootstrap<TAgentDefinition, TToolDefinition, TEvaluator>;
  agents: Record<string, TAgentDefinition>;
  workflows: Record<string, WorkflowDefinition>;
  tools: Record<string, TToolDefinition>;
  evaluators: Record<string, TEvaluator>;
  runProfiles: Map<string, PlatformRunProfile>;
  resolveRun: (
    run: Pick<Run, "profileId">
  ) => PlatformRunResolution<TAgentDefinition, TToolDefinition, TEvaluator>;
}

export const createPlatformRuntimeContext = <
  TAgentDefinition extends PlatformAgentDefinition,
  TToolDefinition,
  TEvaluator
>(
  bootstrap: PlatformBootstrap<TAgentDefinition, TToolDefinition, TEvaluator>
): PlatformRuntimeContext<TAgentDefinition, TToolDefinition, TEvaluator> => ({
  bootstrap,
  agents: bootstrap.agents,
  workflows: bootstrap.workflows,
  tools: bootstrap.tools,
  evaluators: bootstrap.evaluators,
  runProfiles: bootstrap.runProfileMap,
  resolveRun: (run) => {
    const profile =
      bootstrap.runProfileMap.get(run.profileId) ?? bootstrap.runProfiles[run.profileId];

    if (!profile) {
      return {
        ok: false,
        reason: "missing_profile"
      };
    }

    const agent = bootstrap.agents[profile.agentId];

    if (!agent) {
      return {
        ok: false,
        reason: "missing_agent",
        missingName: profile.agentId
      };
    }

    const workflow = bootstrap.workflows[profile.workflowId];

    if (!workflow) {
      return {
        ok: false,
        reason: "missing_workflow",
        missingName: profile.workflowId
      };
    }

    const requiredToolNames = unique([
      ...agent.toolNames,
      ...getWorkflowToolNames(workflow)
    ]);
    const tools: TToolDefinition[] = [];

    for (const toolName of requiredToolNames) {
      const tool = bootstrap.tools[toolName];

      if (!tool) {
        return {
          ok: false,
          reason: "missing_tool",
          missingName: toolName
        };
      }

      tools.push(tool);
    }

    const requiredEvaluatorNames = unique([
      ...agent.evaluatorNames,
      ...getWorkflowEvaluatorNames(workflow)
    ]);
    const evaluators: TEvaluator[] = [];

    for (const evaluatorName of requiredEvaluatorNames) {
      const evaluator = bootstrap.evaluators[evaluatorName];

      if (!evaluator) {
        return {
          ok: false,
          reason: "missing_evaluator",
          missingName: evaluatorName
        };
      }

      evaluators.push(evaluator);
    }

    return {
      ok: true,
      value: {
        profile,
        agent,
        workflow,
        tools,
        evaluators
      }
    };
  }
});
