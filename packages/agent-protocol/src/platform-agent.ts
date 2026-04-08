import type { RunBudget } from "./run";

export interface PlatformAgentBundleMetadata {
  bundleId: string;
  schemaVersion: string;
  rootDir?: string;
  workspaceBootstrapFiles: string[];
  hostRequirements: string[];
  promptAssetPaths: string[];
}

export interface PlatformAgentDefinition {
  id: string;
  name: string;
  description: string;
  defaultBudget: RunBudget;
  bundle?: PlatformAgentBundleMetadata;
}
