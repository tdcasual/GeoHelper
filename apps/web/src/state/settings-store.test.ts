import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { createSettingsStore } from "./settings-store";

describe("settings-store facade", () => {
  it("persists session overrides and experiment flags", () => {
    const store = createSettingsStore();
    store.getState().setSessionOverride("conv_1", {
      model: "gpt-4.1-mini",
      retryAttempts: 3
    });
    store.getState().setExperimentFlag("autoRetryEnabled", true);
    store.getState().setDefaultRetryAttempts(2);

    expect(store.getState().sessionOverrides.conv_1.model).toBe("gpt-4.1-mini");
    expect(store.getState().sessionOverrides.conv_1.retryAttempts).toBe(3);
    expect(store.getState().experimentFlags.autoRetryEnabled).toBe(true);
    expect(store.getState().requestDefaults.retryAttempts).toBe(2);
  });

  it("keeps the thin facade suite below the test maintainability budget", async () => {
    const code = await readFile(new URL("./settings-store.test.ts", import.meta.url), "utf-8");
    expect(code.split(/\r?\n/).length).toBeLessThan(260);
  });
});
