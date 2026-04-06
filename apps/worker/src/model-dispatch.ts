import type { NodeHandlerMap } from "@geohelper/agent-core";

export const createModelDispatch = (
  overrides: NodeHandlerMap = {}
): NodeHandlerMap => ({
  planner: async () => ({
    type: "continue"
  }),
  model: async () => ({
    type: "continue"
  }),
  evaluator: async () => ({
    type: "continue"
  }),
  synthesizer: async () => ({
    type: "complete"
  }),
  ...overrides
});
