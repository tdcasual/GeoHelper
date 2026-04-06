import {
  applyEvalPolicyGate,
  createEvaluationArtifact,
  createRuntimeEvaluator,
  type RuntimeEvaluator,
  type RuntimeEvaluatorDefinition
} from "@geohelper/agent-evals";
import { type Artifact,CheckpointSchema } from "@geohelper/agent-protocol";

import type { IntelligenceNodeDriver } from "./types";

const defaultNow = (): string => new Date().toISOString();

const buildArtifactId = (runId: string, nodeId: string): string =>
  `artifact_eval_${runId}_${nodeId}`;

const buildCheckpointId = (runId: string, nodeId: string): string =>
  `checkpoint_eval_${runId}_${nodeId}`;

export interface CreateEvaluatorDriverOptions {
  evaluators?: Record<string, RuntimeEvaluatorDefinition<any, any>>;
  runtimeEvaluator?: RuntimeEvaluator;
  writeArtifact?: (artifact: Artifact) => Promise<void> | void;
  now?: () => string;
}

export const createEvaluatorDriver = ({
  evaluators = {},
  runtimeEvaluator = createRuntimeEvaluator(),
  writeArtifact,
  now = defaultNow
}: CreateEvaluatorDriverOptions = {}): IntelligenceNodeDriver => ({
  execute: async ({ run, node, context }) => {
    const evaluatorName =
      typeof node.config.evaluatorName === "string"
        ? node.config.evaluatorName
        : node.id;
    const evaluator = evaluators[evaluatorName];

    if (!evaluator) {
      return {
        type: "continue"
      };
    }

    const evaluatorInput =
      node.config.evaluatorInput ?? {
        context
      };
    const scorecard = await runtimeEvaluator.evaluate({
      evaluator,
      input: evaluatorInput
    });
    const artifact = createEvaluationArtifact({
      artifactId: buildArtifactId(run.id, node.id),
      runId: run.id,
      scorecard,
      createdAt: now()
    });

    await writeArtifact?.(artifact);
    run.outputArtifactIds = [...new Set([...run.outputArtifactIds, artifact.id])];

    const gate = applyEvalPolicyGate(scorecard, {
      checkpointOnFailure: node.config.checkpointOnFailure === true,
      minimumScore:
        typeof node.config.minimumScore === "number"
          ? node.config.minimumScore
          : undefined,
      checkpointTitle:
        typeof node.config.checkpointTitle === "string"
          ? node.config.checkpointTitle
          : undefined,
      checkpointPrompt:
        typeof node.config.checkpointPrompt === "string"
          ? node.config.checkpointPrompt
          : undefined
    });

    if (gate.action === "checkpoint") {
      return {
        type: "checkpoint",
        checkpoint: CheckpointSchema.parse({
          id: buildCheckpointId(run.id, node.id),
          runId: run.id,
          nodeId: node.id,
          kind: "human_input",
          status: "pending",
          title: gate.title,
          prompt: gate.prompt,
          createdAt: now()
        })
      };
    }

    return {
      type: "continue"
    };
  }
});
