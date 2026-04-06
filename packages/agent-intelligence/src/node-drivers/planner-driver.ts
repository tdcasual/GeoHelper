import type { IntelligenceNodeDriver } from "./types";

export const createPlannerDriver = (): IntelligenceNodeDriver => ({
  execute: async () => ({
    type: "continue"
  })
});
