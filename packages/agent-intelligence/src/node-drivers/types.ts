import type { ContextPacket } from "@geohelper/agent-context";
import type {
  NodeHandlerContext,
  NodeHandlerResult
} from "@geohelper/agent-core";

export interface IntelligenceNodeDriverInput extends NodeHandlerContext {
  context: ContextPacket;
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
