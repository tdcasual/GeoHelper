import type {
  LoadedPortableAgentBundle,
  PortableToolManifest
} from "@geohelper/agent-bundle";

export interface HostCapabilityToolBindingInput {
  bundle: LoadedPortableAgentBundle;
  manifest: PortableToolManifest;
}

export type HostCapabilityToolFactory<TToolDefinition> = (
  input: HostCapabilityToolBindingInput
) => TToolDefinition;

export interface HostCapabilityBindingRegistry<TToolDefinition> {
  bindings: Record<string, HostCapabilityToolFactory<TToolDefinition>>;
  resolve: (
    hostCapability: string
  ) => HostCapabilityToolFactory<TToolDefinition> | null;
}

export const createHostCapabilityBindingRegistry = <TToolDefinition>(
  bindings: Record<string, HostCapabilityToolFactory<TToolDefinition>>
): HostCapabilityBindingRegistry<TToolDefinition> => ({
  bindings: {
    ...bindings
  },
  resolve: (hostCapability) => bindings[hostCapability] ?? null
});

export const bindToolManifestByHostCapability = <TToolDefinition>(input: {
  bundle: LoadedPortableAgentBundle;
  manifest: PortableToolManifest;
  registry: HostCapabilityBindingRegistry<TToolDefinition>;
}): TToolDefinition => {
  if (!input.manifest.hostCapability) {
    throw new Error(
      `Portable tool manifest ${input.manifest.name} is missing hostCapability`
    );
  }

  const binding = input.registry.resolve(input.manifest.hostCapability);

  if (!binding) {
    throw new Error(
      `Missing host capability binding: ${input.manifest.hostCapability} for tool ${input.manifest.name}`
    );
  }

  return binding({
    bundle: input.bundle,
    manifest: input.manifest
  });
};
