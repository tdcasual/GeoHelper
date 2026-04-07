import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { LoadedPortableAgentBundle } from "@geohelper/agent-bundle";

import {
  createOpenClawCompatibilityReport,
  type OpenClawCompatibilityReport
} from "./export-report";

export interface ExportOpenClawBundleResult {
  outputDir: string;
  report: OpenClawCompatibilityReport;
}

const writeJson = (filePath: string, value: unknown): void => {
  mkdirSync(path.dirname(filePath), {
    recursive: true
  });
  writeFileSync(filePath, JSON.stringify(value, null, 2));
};

const writeText = (filePath: string, value: string): void => {
  mkdirSync(path.dirname(filePath), {
    recursive: true
  });
  writeFileSync(filePath, value);
};

export const exportOpenClawBundleToFs = (input: {
  bundle: LoadedPortableAgentBundle;
  outputDir: string;
}): ExportOpenClawBundleResult => {
  const { bundle, outputDir } = input;
  const report = createOpenClawCompatibilityReport(bundle);

  writeJson(path.join(outputDir, "agent.json"), bundle.manifest);
  writeJson(path.join(outputDir, bundle.manifest.workflow.path), bundle.workflow);

  for (const workspaceFile of bundle.workspaceFiles) {
    writeText(
      path.join(outputDir, workspaceFile.relativePath),
      workspaceFile.content
    );
  }

  for (const promptFile of bundle.promptFiles) {
    writeText(path.join(outputDir, promptFile.relativePath), promptFile.content);
  }

  for (const [index, relativePath] of bundle.manifest.tools.entries()) {
    writeJson(path.join(outputDir, relativePath), bundle.tools[index]);
  }

  for (const [index, relativePath] of bundle.manifest.evaluators.entries()) {
    writeJson(path.join(outputDir, relativePath), bundle.evaluators[index]);
  }

  writeJson(
    path.join(outputDir, bundle.manifest.policies.context),
    bundle.contextPolicy
  );
  writeJson(
    path.join(outputDir, bundle.manifest.policies.memory),
    bundle.memoryPolicy
  );
  writeJson(
    path.join(outputDir, bundle.manifest.policies.approval),
    bundle.approvalPolicy
  );
  writeJson(
    path.join(outputDir, bundle.manifest.artifacts.outputContract),
    bundle.outputContract
  );

  if (bundle.manifest.delegation && bundle.delegationConfig) {
    writeJson(
      path.join(outputDir, bundle.manifest.delegation.config),
      bundle.delegationConfig
    );
  }

  writeJson(path.join(outputDir, "export-report.json"), report);

  return {
    outputDir,
    report
  };
};
