import type { IntelligenceNodeDriver } from "./types";

export const createModelDriver = (): IntelligenceNodeDriver => ({
  execute: async () => ({
    type: "continue"
  })
});
