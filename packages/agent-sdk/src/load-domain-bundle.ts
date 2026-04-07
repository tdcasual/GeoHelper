import { type LoadedPortableAgentBundle,loadPortableAgentBundleFromFs } from "@geohelper/agent-bundle";
import type { PlatformAgentDefinition } from "@geohelper/agent-protocol";
import type { PlatformRunProfile } from "@geohelper/agent-protocol";

import {
  createBundleBackedPlatformAgentDefinition,
  createRunProfilesFromBundle
} from "./bundle-registry";
import type { DomainPackage } from "./domain-package";

export interface CreateBundleDomainPackageOptions<
  TAgentDefinition extends PlatformAgentDefinition = PlatformAgentDefinition,
  TToolDefinition = unknown,
  TEvaluator = unknown
> {
  id: string;
  bundle: LoadedPortableAgentBundle;
  bindTool: (input: {
    bundle: LoadedPortableAgentBundle;
    manifest: LoadedPortableAgentBundle["tools"][number];
  }) => TToolDefinition;
  bindEvaluator: (input: {
    bundle: LoadedPortableAgentBundle;
    manifest: LoadedPortableAgentBundle["evaluators"][number];
  }) => TEvaluator;
  decorateAgent?: (agent: PlatformAgentDefinition) => TAgentDefinition;
  buildRunProfiles?: (input: {
    bundle: LoadedPortableAgentBundle;
    agent: TAgentDefinition;
    workflowId: string;
  }) => Record<string, PlatformRunProfile>;
}

export const createBundleDomainPackage = <
  TAgentDefinition extends PlatformAgentDefinition = PlatformAgentDefinition,
  TToolDefinition = unknown,
  TEvaluator = unknown
>({
  id,
  bundle,
  bindTool,
  bindEvaluator,
  decorateAgent,
  buildRunProfiles
}: CreateBundleDomainPackageOptions<
  TAgentDefinition,
  TToolDefinition,
  TEvaluator
>): DomainPackage<TAgentDefinition, TToolDefinition, TEvaluator> => {
  const workflowId = bundle.workflow.id;
  const toolNames = bundle.tools.map((tool) => tool.name);
  const evaluatorNames = bundle.evaluators.map((evaluator) => evaluator.name);
  const agent = createBundleBackedPlatformAgentDefinition({
    bundle,
    workflowId,
    toolNames,
    evaluatorNames,
    decorate: decorateAgent
  });

  const runProfiles = buildRunProfiles
    ? buildRunProfiles({
        bundle,
        agent,
        workflowId
      })
    : createRunProfilesFromBundle({
        bundle,
        agent,
        defaultWorkflowId: workflowId
      });
  const tools = Object.fromEntries(
    bundle.tools.map((manifest) => [
      manifest.name,
      bindTool({
        bundle,
        manifest
      })
    ])
  );
  const evaluators = Object.fromEntries(
    bundle.evaluators.map((manifest) => [
      manifest.name,
      bindEvaluator({
        bundle,
        manifest
      })
    ])
  );

  return {
    id,
    agents: {
      [agent.id]: agent
    },
    runProfiles,
    workflows: {
      [bundle.workflow.id]: bundle.workflow
    },
    tools,
    evaluators
  };
};

export interface LoadBundleDomainPackageFromFsOptions<
  TAgentDefinition extends PlatformAgentDefinition = PlatformAgentDefinition,
  TToolDefinition = unknown,
  TEvaluator = unknown
> extends Omit<
  CreateBundleDomainPackageOptions<TAgentDefinition, TToolDefinition, TEvaluator>,
  "bundle"
> {
  bundleDir: string;
}

export const loadBundleDomainPackageFromFs = <
  TAgentDefinition extends PlatformAgentDefinition = PlatformAgentDefinition,
  TToolDefinition = unknown,
  TEvaluator = unknown
>({
  bundleDir,
  ...options
}: LoadBundleDomainPackageFromFsOptions<
  TAgentDefinition,
  TToolDefinition,
  TEvaluator
>): DomainPackage<TAgentDefinition, TToolDefinition, TEvaluator> =>
  createBundleDomainPackage({
    ...options,
    bundle: loadPortableAgentBundleFromFs(bundleDir)
  });
