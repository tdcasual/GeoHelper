import type { IntelligenceNodeDriver } from "./types";

export const createSynthesizerDriver = (): IntelligenceNodeDriver => ({
  execute: async () => ({
    type: "complete"
  })
});
