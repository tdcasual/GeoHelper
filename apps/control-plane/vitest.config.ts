import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@geohelper/agent-domain-geometry": fileURLToPath(
        new URL("../../packages/agent-domain-geometry/src/index.ts", import.meta.url)
      )
    }
  },
  test: {
    include: ["test/**/*.test.ts"]
  }
});
