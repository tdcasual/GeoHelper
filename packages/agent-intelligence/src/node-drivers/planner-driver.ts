import { createPromptArtifact } from "../prompt-composer";
import type {
  IntelligenceNodeDriver,
  PromptBackedNodeDriverOptions
} from "./types";

const defaultNow = (): string => new Date().toISOString();

export const createPlannerDriver = ({
  writeArtifact,
  now = defaultNow
}: PromptBackedNodeDriverOptions = {}): IntelligenceNodeDriver => ({
  execute: async ({ run, node, context }) => {
    const artifact = createPromptArtifact({
      runId: run.id,
      nodeId: node.id,
      now: now(),
      context,
      driverKind: "planner"
    });

    await writeArtifact?.(artifact);
    run.outputArtifactIds = [...new Set([...run.outputArtifactIds, artifact.id])];

    return {
      type: "continue"
    };
  }
});
