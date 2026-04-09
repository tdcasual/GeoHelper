import {
  type LoadedPortableAgentBundle,
  loadPortableAgentBundleFromFs
} from "@geohelper/agent-bundle";

interface NamedAgentDelegation {
  name: string;
  agentRef: string;
}

interface NamedHostServiceDelegation {
  name: string;
  serviceRef: string;
}

export interface OpenClawCompatibilityReport {
  bundleId: string;
  schemaVersion: string;
  recommendedImportMode: "portable" | "portable-with-host-bindings";
  requiredOpenClawCapabilities: string[];
  fullyPortableTools: string[];
  hostBoundTools: string[];
  nativeSubagentDelegations: NamedAgentDelegation[];
  acpAgentDelegations: NamedAgentDelegation[];
  hostServiceDelegations: NamedHostServiceDelegation[];
  degradedBehaviors: string[];
  notes: string[];
}

const unique = (values: string[]): string[] => [...new Set(values)];

export const createOpenClawCompatibilityReport = (
  bundle: LoadedPortableAgentBundle
): OpenClawCompatibilityReport => {
  const fullyPortableTools = bundle.tools
    .filter((tool) => {
      const mode = tool.export.openClaw?.mode;

      return mode === "native-tool" || mode === "plugin";
    })
    .map((tool) => tool.name);
  const hostBoundTools = bundle.tools
    .filter((tool) => {
      const mode = tool.export.openClaw?.mode;

      return mode === "host-bound" || mode === "unsupported";
    })
    .map((tool) => tool.name);
  const nativeSubagentDelegations =
    bundle.delegationConfig?.delegations
      .filter((delegation) => delegation.mode === "native-subagent")
      .map((delegation) => ({
        name: delegation.name,
        agentRef: delegation.agentRef ?? ""
      })) ?? [];
  const acpAgentDelegations =
    bundle.delegationConfig?.delegations
      .filter((delegation) => delegation.mode === "acp-agent")
      .map((delegation) => ({
        name: delegation.name,
        agentRef: delegation.agentRef ?? ""
      })) ?? [];
  const hostServiceDelegations =
    bundle.delegationConfig?.delegations
      .filter((delegation) => delegation.mode === "host-service")
      .map((delegation) => ({
        name: delegation.name,
        serviceRef: delegation.serviceRef ?? ""
      })) ?? [];
  const requiredOpenClawCapabilities = unique([
    ...bundle.manifest.hostRequirements
  ]);
  const degradedBehaviors = [
    ...hostBoundTools.map(
      (toolName) =>
        `Tool ${toolName} requires host capability binding and may need a plugin or delegation executor bridge in OpenClaw.`
    ),
    ...hostServiceDelegations.map(
      (delegation) =>
        `Delegation ${delegation.name} requires a destination host binding for service ${delegation.serviceRef}.`
    )
  ];

  return {
    bundleId: bundle.manifest.id,
    schemaVersion: bundle.manifest.schemaVersion,
    recommendedImportMode:
      hostBoundTools.length > 0 || hostServiceDelegations.length > 0
        ? "portable-with-host-bindings"
        : "portable",
    requiredOpenClawCapabilities,
    fullyPortableTools,
    hostBoundTools,
    nativeSubagentDelegations,
    acpAgentDelegations,
    hostServiceDelegations,
    degradedBehaviors,
    notes: [
      "Workspace bootstrap files are copied directly for OpenClaw-friendly import.",
      "Host-bound capabilities must be reattached in the destination runtime.",
      ...(acpAgentDelegations.length > 0
        ? [
            "ACP agent delegations can be mapped to external OpenClaw-compatible executors or ACP harnesses."
          ]
        : []),
      ...(nativeSubagentDelegations.length > 0
        ? [
            "Native subagent delegations can be mapped to portable agent-to-agent workflows in the destination runtime."
          ]
        : []),
      ...(hostServiceDelegations.length > 0
        ? [
            "Host service delegations require thin host adapters in the destination runtime."
          ]
        : [])
    ]
  };
};

export const createOpenClawCompatibilityReportFromBundleDir = (input: {
  bundleDir: string;
}): OpenClawCompatibilityReport =>
  createOpenClawCompatibilityReport(
    loadPortableAgentBundleFromFs(input.bundleDir)
  );
