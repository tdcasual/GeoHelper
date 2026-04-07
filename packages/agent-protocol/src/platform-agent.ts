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
  workflowId: string;
  toolNames: string[];
  evaluatorNames: string[];
  defaultBudget: RunBudget;
  bundle?: PlatformAgentBundleMetadata;
}
