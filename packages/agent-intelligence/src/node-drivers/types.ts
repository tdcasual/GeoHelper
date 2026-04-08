import type { ContextPacket } from "@geohelper/agent-context";
import type {
  NodeHandlerContext,
  NodeHandlerResult
} from "@geohelper/agent-core";
import type { Artifact } from "@geohelper/agent-protocol";

export interface IntelligenceNodeDriverInput extends NodeHandlerContext {
  context: ContextPacket;
}

export type IntelligenceArtifactWriter = (
  artifact: Artifact
) => Promise<void> | void;

export type IntelligenceNow = () => string;

export interface PromptBackedNodeDriverOptions {
  writeArtifact?: IntelligenceArtifactWriter;
  now?: IntelligenceNow;
}

export interface IntelligenceNodeDriver {
  execute: (
    input: IntelligenceNodeDriverInput
  ) => Promise<NodeHandlerResult> | NodeHandlerResult;
}

export interface PlatformNodeDrivers {
  planner?: IntelligenceNodeDriver;
  model?: IntelligenceNodeDriver;
  evaluator?: IntelligenceNodeDriver;
  synthesizer?: IntelligenceNodeDriver;
}
