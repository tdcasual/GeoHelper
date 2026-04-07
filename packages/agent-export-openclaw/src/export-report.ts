import type { LoadedPortableAgentBundle } from "@geohelper/agent-bundle";

export interface OpenClawCompatibilityReport {
  bundleId: string;
  schemaVersion: string;
  recommendedImportMode: "portable" | "portable-with-host-bindings";
  requiredOpenClawCapabilities: string[];
  fullyPortableTools: string[];
  hostBoundTools: string[];
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
  const requiredOpenClawCapabilities = unique([
    ...bundle.manifest.hostRequirements
  ]);
  const degradedBehaviors = hostBoundTools.map(
    (toolName) =>
      `Tool ${toolName} requires host capability binding and may need a plugin or ACP bridge in OpenClaw.`
  );

  return {
    bundleId: bundle.manifest.id,
    schemaVersion: bundle.manifest.schemaVersion,
    recommendedImportMode:
      hostBoundTools.length > 0
        ? "portable-with-host-bindings"
        : "portable",
    requiredOpenClawCapabilities,
    fullyPortableTools,
    hostBoundTools,
    degradedBehaviors,
    notes: [
      "Workspace bootstrap files are copied directly for OpenClaw-friendly import.",
      "Host-bound capabilities must be reattached in the destination runtime."
    ]
  };
};
