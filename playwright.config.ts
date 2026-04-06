import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:41731",
    trace: "on-first-retry"
  },
  webServer: {
    command: "pnpm --filter @geohelper/web dev --host 127.0.0.1 --port 41731",
    url: "http://127.0.0.1:41731",
    reuseExistingServer: false,
    timeout: 120_000
  }
});
