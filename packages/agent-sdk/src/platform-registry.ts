import type {
  PlatformAgentDefinition,
  PlatformBootstrap,
  PlatformRunProfile
} from "@geohelper/agent-protocol";

import type { DomainPackage } from "./domain-package";

export interface PlatformRegistry<
  TAgentDefinition extends PlatformAgentDefinition = PlatformAgentDefinition,
  TToolDefinition = unknown,
  TEvaluator = unknown
> {
  domainPackages: DomainPackage<TAgentDefinition, TToolDefinition, TEvaluator>[];
  bootstrap: PlatformBootstrap<TAgentDefinition, TToolDefinition, TEvaluator>;
}

export interface CreatePlatformRegistryInput<
  TAgentDefinition extends PlatformAgentDefinition = PlatformAgentDefinition,
  TToolDefinition = unknown,
  TEvaluator = unknown
> {
  domainPackages: DomainPackage<TAgentDefinition, TToolDefinition, TEvaluator>[];
}

const mergeRecord = <T>(
  target: Record<string, T>,
  next: Record<string, T>,
  namespace: string
): Record<string, T> => {
  for (const [key, value] of Object.entries(next)) {
    if (key in target) {
      throw new Error(`Duplicate ${namespace} registration: ${key}`);
    }

    target[key] = value;
  }

  return target;
};

const createRunProfileMap = (
  runProfiles: Record<string, PlatformRunProfile>
): Map<string, PlatformRunProfile> =>
  new Map(
    Object.values(runProfiles).map((profile) => [
      profile.id,
      profile
    ])
  );

export const createPlatformRegistry = <
  TAgentDefinition extends PlatformAgentDefinition = PlatformAgentDefinition,
  TToolDefinition = unknown,
  TEvaluator = unknown
>({
  domainPackages
}: CreatePlatformRegistryInput<
  TAgentDefinition,
  TToolDefinition,
  TEvaluator
>): PlatformRegistry<TAgentDefinition, TToolDefinition, TEvaluator> => {
  const agents: Record<string, TAgentDefinition> = {};
  const runProfiles: Record<string, PlatformRunProfile> = {};
  const workflows = {};
  const tools = {};
  const evaluators = {};

  for (const domainPackage of domainPackages) {
    mergeRecord(agents, domainPackage.agents, "agent");
    mergeRecord(runProfiles, domainPackage.runProfiles, "run profile");
    mergeRecord(workflows, domainPackage.workflows, "workflow");
    mergeRecord(tools, domainPackage.tools, "tool");
    mergeRecord(evaluators, domainPackage.evaluators, "evaluator");
  }

  return {
    domainPackages: [...domainPackages],
    bootstrap: {
      agents,
      runProfiles,
      runProfileMap: createRunProfileMap(runProfiles),
      workflows,
      tools,
      evaluators
    }
  };
};

export const createPlatformBootstrap = <
  TAgentDefinition extends PlatformAgentDefinition = PlatformAgentDefinition,
  TToolDefinition = unknown,
  TEvaluator = unknown
>(
  input: CreatePlatformRegistryInput<
    TAgentDefinition,
    TToolDefinition,
    TEvaluator
  >
): PlatformBootstrap<TAgentDefinition, TToolDefinition, TEvaluator> =>
  createPlatformRegistry(input).bootstrap;
