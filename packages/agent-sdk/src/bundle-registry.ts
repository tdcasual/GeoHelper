import type {
  LoadedPortableAgentBundle,
  PortableEvaluatorManifest,
  PortableToolManifest
} from "@geohelper/agent-bundle";
import type {
  PlatformAgentBundleMetadata,
  PlatformAgentDefinition,
  PlatformRunProfile
} from "@geohelper/agent-protocol";
import { PlatformRunProfileSchema } from "@geohelper/agent-protocol";

export interface BundleToolBinder<TToolDefinition> {
  manifest: PortableToolManifest;
  create: () => TToolDefinition;
}

export interface BundleEvaluatorBinder<TEvaluator> {
  manifest: PortableEvaluatorManifest;
  create: () => TEvaluator;
}

export const createPlatformAgentBundleMetadata = (
  bundle: LoadedPortableAgentBundle
): PlatformAgentBundleMetadata => ({
  bundleId: bundle.manifest.id,
  schemaVersion: bundle.manifest.schemaVersion,
  rootDir: bundle.rootDir,
  workspaceBootstrapFiles: bundle.workspaceFiles.map(
    (file) => file.relativePath
  ),
  hostRequirements: [...bundle.manifest.hostRequirements],
  promptAssetPaths: bundle.promptFiles.map((file) => file.relativePath)
});

export const createPortablePlatformAgentDefinition = <
  TAgentDefinition extends PlatformAgentDefinition = PlatformAgentDefinition
>(input: {
  bundle: LoadedPortableAgentBundle;
  decorate?: (agent: PlatformAgentDefinition) => TAgentDefinition;
}): TAgentDefinition => {
  const agent: PlatformAgentDefinition = {
    id: input.bundle.manifest.id,
    name: input.bundle.manifest.name,
    description: input.bundle.manifest.description,
    defaultBudget: input.bundle.manifest.defaultBudget,
    bundle: createPlatformAgentBundleMetadata(input.bundle)
  };

  return input.decorate ? input.decorate(agent) : (agent as TAgentDefinition);
};

export const createRunProfilesFromBundle = (input: {
  bundle: LoadedPortableAgentBundle;
  agent: Pick<PlatformAgentDefinition, "id" | "defaultBudget">;
  defaultWorkflowId: string;
}): Record<string, PlatformRunProfile> => {
  const profiles = input.bundle.manifest.runProfiles.length > 0
    ? input.bundle.manifest.runProfiles
    : [
        {
          id: `platform_${input.bundle.manifest.id}_standard`,
          name: `${input.bundle.manifest.name} Standard`,
          description: "Default portable run profile"
        }
      ];

  return Object.fromEntries(
    profiles.map((profile) => [
      profile.id,
      PlatformRunProfileSchema.parse({
        id: profile.id,
        name: profile.name,
        description: profile.description,
        agentId: input.agent.id,
        workflowId: profile.workflowId ?? input.defaultWorkflowId,
        defaultBudget: profile.defaultBudget ?? input.agent.defaultBudget
      })
    ])
  );
};
