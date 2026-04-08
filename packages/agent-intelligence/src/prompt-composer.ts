import type { ContextPacket } from "@geohelper/agent-context";
import {
  type Artifact,
  type ArtifactKind,
  ArtifactSchema} from "@geohelper/agent-protocol";

export type BundlePromptDriverKind = "planner" | "model" | "synthesizer";

export interface ResolvedBundlePrompt {
  driverKind: BundlePromptDriverKind;
  promptPath: string;
  promptText: string;
}

const PROMPT_ENTRYPOINTS: Record<
  BundlePromptDriverKind,
  {
    entrypointKey: "plannerPrompt" | "executorPrompt" | "synthesizerPrompt";
    artifactKind: ArtifactKind;
  }
> = {
  planner: {
    entrypointKey: "plannerPrompt",
    artifactKind: "plan"
  },
  model: {
    entrypointKey: "executorPrompt",
    artifactKind: "draft"
  },
  synthesizer: {
    entrypointKey: "synthesizerPrompt",
    artifactKind: "response"
  }
};

const toDriverLabel = (driverKind: BundlePromptDriverKind): string => {
  if (driverKind === "model") {
    return "executor";
  }

  return driverKind;
};

const serializeContext = (context: ContextPacket) => ({
  system: context.system,
  instructions: context.instructions,
  conversation: context.conversation,
  artifacts: context.artifacts,
  memories: context.memories,
  workspace: context.workspace,
  toolCatalog: context.toolCatalog
});

export const resolveBundlePrompt = (
  context: ContextPacket,
  driverKind: BundlePromptDriverKind
): ResolvedBundlePrompt => {
  if (!context.bundle) {
    throw new Error(`Missing bundle context for ${driverKind} driver`);
  }

  const driverConfig = PROMPT_ENTRYPOINTS[driverKind];
  const promptPath = context.bundle.manifest.entrypoint[driverConfig.entrypointKey];

  if (!promptPath) {
    throw new Error(
      `Missing ${toDriverLabel(driverKind)} prompt reference in bundle entrypoint`
    );
  }

  const promptText = context.bundle.prompts[promptPath];

  if (!promptText) {
    throw new Error(
      `Missing ${toDriverLabel(driverKind)} prompt asset: ${promptPath}`
    );
  }

  return {
    driverKind,
    promptPath,
    promptText
  };
};

export const composeBundlePrompt = (
  context: ContextPacket,
  driverKind: BundlePromptDriverKind
): string => {
  const prompt = resolveBundlePrompt(context, driverKind);

  return [
    "# Prompt Asset",
    prompt.promptText,
    "# Context",
    JSON.stringify(serializeContext(context), null, 2)
  ].join("\n\n");
};

export const createPromptArtifact = (input: {
  runId: string;
  nodeId: string;
  now: string;
  context: ContextPacket;
  driverKind: BundlePromptDriverKind;
}): Artifact => {
  const prompt = resolveBundlePrompt(input.context, input.driverKind);
  const artifactKind = PROMPT_ENTRYPOINTS[input.driverKind].artifactKind;

  return ArtifactSchema.parse({
    id: `artifact_${artifactKind}_${input.runId}_${input.nodeId}`,
    runId: input.runId,
    kind: artifactKind,
    contentType: "application/json",
    storage: "inline",
    inlineData: {
      prompt: composeBundlePrompt(input.context, input.driverKind),
      promptText: prompt.promptText,
      promptPath: prompt.promptPath,
      outputContract:
        input.driverKind === "synthesizer"
          ? input.context.bundle?.outputContract ?? null
          : null,
      context: serializeContext(input.context)
    },
    metadata: {
      bundleId: input.context.bundle?.manifest.id ?? null,
      nodeId: input.nodeId,
      promptPath: prompt.promptPath,
      driverKind: input.driverKind
    },
    createdAt: input.now
  });
};
