import type { WorkflowDefinition } from "@geohelper/agent-protocol";

import {
  parsePortableWorkflowDefinition,
  type PortableAgentManifest,
  PortableAgentManifestSchema,
  type PortableApprovalPolicy,
  PortableApprovalPolicySchema,
  type PortableArtifactOutputContract,
  PortableArtifactOutputContractSchema,
  type PortableContextPolicy,
  PortableContextPolicySchema,
  type PortableDelegationConfig,
  PortableDelegationConfigSchema,
  type PortableEvaluatorManifest,
  PortableEvaluatorManifestSchema,
  type PortableMemoryPolicy,
  PortableMemoryPolicySchema,
  type PortableToolManifest,
  PortableToolManifestSchema} from "./bundle-schema";

export interface BundleTextAsset {
  relativePath: string;
  absolutePath: string;
  content: string;
}

export interface LoadedPortableAgentBundle {
  rootDir: string;
  manifest: PortableAgentManifest;
  workflow: WorkflowDefinition;
  workspaceFiles: BundleTextAsset[];
  promptFiles: BundleTextAsset[];
  textAssets: Record<string, string>;
  tools: PortableToolManifest[];
  evaluators: PortableEvaluatorManifest[];
  contextPolicy: PortableContextPolicy;
  memoryPolicy: PortableMemoryPolicy;
  approvalPolicy: PortableApprovalPolicy;
  outputContract: PortableArtifactOutputContract;
  delegationConfig: PortableDelegationConfig | null;
}

export interface BundleFileLoader {
  exists: (absolutePath: string) => boolean;
  readText: (absolutePath: string) => string;
  resolve: (...segments: string[]) => string;
}

export class PortableAgentBundleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PortableAgentBundleError";
  }
}

const ensureFile = (
  loader: BundleFileLoader,
  rootDir: string,
  relativePath: string,
  label: string
): string => {
  const absolutePath = loader.resolve(rootDir, relativePath);

  if (!loader.exists(absolutePath)) {
    throw new PortableAgentBundleError(
      `Missing ${label}: ${relativePath}`
    );
  }

  return absolutePath;
};

const readTextAsset = (
  loader: BundleFileLoader,
  rootDir: string,
  relativePath: string,
  label: string
): BundleTextAsset => {
  const absolutePath = ensureFile(loader, rootDir, relativePath, label);

  return {
    relativePath,
    absolutePath,
    content: loader.readText(absolutePath)
  };
};

const readJson = <T>(
  loader: BundleFileLoader,
  rootDir: string,
  relativePath: string,
  label: string,
  parse: (input: unknown) => T
): T => {
  const absolutePath = ensureFile(loader, rootDir, relativePath, label);
  const raw = loader.readText(absolutePath);

  try {
    return parse(JSON.parse(raw));
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "invalid_json_payload";

    throw new PortableAgentBundleError(
      `Invalid ${label}: ${relativePath} (${reason})`
    );
  }
};

const toTextAssetMap = (assets: BundleTextAsset[]): Record<string, string> =>
  Object.fromEntries(assets.map((asset) => [asset.relativePath, asset.content]));

const unique = (values: string[]): string[] => [...new Set(values)];

export const loadPortableAgentBundle = (
  bundleDir: string,
  loader: BundleFileLoader
): LoadedPortableAgentBundle => {
  const manifest = readJson(
    loader,
    bundleDir,
    "agent.json",
    "agent manifest",
    (input) => PortableAgentManifestSchema.parse(input)
  );
  const workflow = readJson(
    loader,
    bundleDir,
    manifest.workflow.path,
    "workflow definition",
    parsePortableWorkflowDefinition
  );

  const workspaceFiles = manifest.workspace.bootstrapFiles.map((relativePath) =>
    readTextAsset(loader, bundleDir, relativePath, "workspace bootstrap file")
  );
  const promptPaths = unique(
    [
      manifest.entrypoint.plannerPrompt,
      manifest.entrypoint.executorPrompt,
      manifest.entrypoint.synthesizerPrompt
    ].filter((value): value is string => typeof value === "string")
  );
  const tools = manifest.tools.map((relativePath) =>
    readJson(loader, bundleDir, relativePath, "tool manifest", (input) =>
      PortableToolManifestSchema.parse(input)
    )
  );
  const evaluators = manifest.evaluators.map((relativePath) =>
    readJson(loader, bundleDir, relativePath, "evaluator manifest", (input) =>
      PortableEvaluatorManifestSchema.parse(input)
    )
  );
  const evaluatorPromptPaths = evaluators.flatMap((evaluator) =>
    evaluator.promptRef ? [evaluator.promptRef] : []
  );
  const promptFiles = unique([...promptPaths, ...evaluatorPromptPaths]).map(
    (relativePath) =>
      readTextAsset(loader, bundleDir, relativePath, "prompt file")
  );

  return {
    rootDir: bundleDir,
    manifest,
    workflow,
    workspaceFiles,
    promptFiles,
    textAssets: {
      ...toTextAssetMap(workspaceFiles),
      ...toTextAssetMap(promptFiles)
    },
    tools,
    evaluators,
    contextPolicy: readJson(
      loader,
      bundleDir,
      manifest.policies.context,
      "context policy",
      (input) => PortableContextPolicySchema.parse(input)
    ),
    memoryPolicy: readJson(
      loader,
      bundleDir,
      manifest.policies.memory,
      "memory policy",
      (input) => PortableMemoryPolicySchema.parse(input)
    ),
    approvalPolicy: readJson(
      loader,
      bundleDir,
      manifest.policies.approval,
      "approval policy",
      (input) => PortableApprovalPolicySchema.parse(input)
    ),
    outputContract: readJson(
      loader,
      bundleDir,
      manifest.artifacts.outputContract,
      "output contract",
      (input) => PortableArtifactOutputContractSchema.parse(input)
    ),
    delegationConfig: manifest.delegation
      ? readJson(
          loader,
          bundleDir,
          manifest.delegation.config,
          "delegation config",
          (input) => PortableDelegationConfigSchema.parse(input)
        )
      : null
  };
};
