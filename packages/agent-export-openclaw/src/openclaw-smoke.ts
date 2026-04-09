import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  parsePortableWorkflowDefinition,
  PortableAgentManifestSchema,
  PortableApprovalPolicySchema,
  PortableArtifactOutputContractSchema,
  PortableContextPolicySchema,
  PortableDelegationConfigSchema,
  PortableEvaluatorManifestSchema,
  PortableMemoryPolicySchema,
  PortableToolManifestSchema} from "@geohelper/agent-bundle";

import type { OpenClawCompatibilityReport } from "./export-report";

export interface OpenClawSmokeImportResult {
  bundleId: string;
  workflowId: string;
  runProfileIds: string[];
  workspaceBootstrapFiles: string[];
  entrypointPrompts: string[];
  promptAssetPaths: string[];
  exportedToolNames: string[];
  exportedEvaluatorNames: string[];
  delegationModes: string[];
  compatibility: OpenClawCompatibilityReport;
  cleanExternalMoveReady: boolean;
  extractionBlockers: string[];
  thinAdapter: {
    requiresHostBindings: boolean;
    hostBoundTools: string[];
    requiredOpenClawCapabilities: string[];
    recommendedImportMode: OpenClawCompatibilityReport["recommendedImportMode"];
    acpAgentDelegations: OpenClawCompatibilityReport["acpAgentDelegations"];
    hostServiceDelegations: OpenClawCompatibilityReport["hostServiceDelegations"];
  };
}

const readTextFile = (filePath: string): string => {
  if (!existsSync(filePath)) {
    throw new Error(`Missing exported file: ${filePath}`);
  }

  return readFileSync(filePath, "utf8");
};

const readJsonFile = <T>(filePath: string): T =>
  JSON.parse(readTextFile(filePath)) as T;

const readNonEmptyText = (workspaceDir: string, relativePath: string): string => {
  const content = readTextFile(path.join(workspaceDir, relativePath));

  if (!content.trim()) {
    throw new Error(`Exported file is empty: ${relativePath}`);
  }

  return content;
};

export const smokeImportOpenClawWorkspace = (input: {
  workspaceDir: string;
}): OpenClawSmokeImportResult => {
  const manifest = PortableAgentManifestSchema.parse(
    readJsonFile(path.join(input.workspaceDir, "agent.json"))
  );
  const workflow = parsePortableWorkflowDefinition(
    readJsonFile(path.join(input.workspaceDir, manifest.workflow.path))
  );
  const compatibility = readJsonFile<OpenClawCompatibilityReport>(
    path.join(input.workspaceDir, "export-report.json")
  );

  PortableContextPolicySchema.parse(
    readJsonFile(path.join(input.workspaceDir, manifest.policies.context))
  );
  PortableMemoryPolicySchema.parse(
    readJsonFile(path.join(input.workspaceDir, manifest.policies.memory))
  );
  PortableApprovalPolicySchema.parse(
    readJsonFile(path.join(input.workspaceDir, manifest.policies.approval))
  );
  PortableArtifactOutputContractSchema.parse(
    readJsonFile(path.join(input.workspaceDir, manifest.artifacts.outputContract))
  );

  const workspaceBootstrapFiles = manifest.workspace.bootstrapFiles.map(
    (relativePath) => {
      readNonEmptyText(input.workspaceDir, relativePath);

      return relativePath;
    }
  );
  const entrypointPrompts = Object.values(manifest.entrypoint).flatMap((relativePath) => {
    if (!relativePath) {
      return [];
    }

    readNonEmptyText(input.workspaceDir, relativePath);

    return [relativePath];
  });
  const tools = manifest.tools.map((relativePath) =>
    PortableToolManifestSchema.parse(
      readJsonFile(path.join(input.workspaceDir, relativePath))
    )
  );
  const evaluators = manifest.evaluators.map((relativePath) =>
    PortableEvaluatorManifestSchema.parse(
      readJsonFile(path.join(input.workspaceDir, relativePath))
    )
  );

  const evaluatorPromptPaths = evaluators.flatMap((evaluator) => {
    if (!evaluator.promptRef) {
      return [];
    }

    readNonEmptyText(input.workspaceDir, evaluator.promptRef);

    return [evaluator.promptRef];
  });

  const delegationModes = manifest.delegation
    ? PortableDelegationConfigSchema.parse(
        readJsonFile(path.join(input.workspaceDir, manifest.delegation.config))
      ).delegations.map((delegation) => delegation.mode)
    : [];

  return {
    bundleId: manifest.id,
    workflowId: workflow.id,
    runProfileIds: manifest.runProfiles.map((profile) => profile.id),
    workspaceBootstrapFiles,
    entrypointPrompts,
    promptAssetPaths: [...new Set([...entrypointPrompts, ...evaluatorPromptPaths])],
    exportedToolNames: tools.map((tool) => tool.name),
    exportedEvaluatorNames: evaluators.map((evaluator) => evaluator.name),
    delegationModes,
    compatibility,
    cleanExternalMoveReady:
      compatibility.recommendedImportMode === "portable" &&
      compatibility.extractionBlockers.length === 0,
    extractionBlockers: compatibility.extractionBlockers,
    thinAdapter: {
      requiresHostBindings: compatibility.recommendedImportMode === "portable-with-host-bindings",
      hostBoundTools: compatibility.hostBoundTools,
      requiredOpenClawCapabilities: compatibility.requiredOpenClawCapabilities,
      recommendedImportMode: compatibility.recommendedImportMode,
      acpAgentDelegations: compatibility.acpAgentDelegations,
      hostServiceDelegations: compatibility.hostServiceDelegations
    }
  };
};
