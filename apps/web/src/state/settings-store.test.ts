import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { createSettingsStore } from "./settings-store";
import { createMemoryStorage } from "./settings-store.test-helpers";

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

  it("persists opaque platform run profile ids across store reloads", () => {
    const originalLocalStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: createMemoryStorage()
    });

    try {
      const store = createSettingsStore();
      store
        .getState()
        .setDefaultPlatformAgentProfile("platform_remote_custom");

      expect(store.getState().defaultPlatformAgentProfileId).toBe(
        "platform_remote_custom"
      );

      const reloadedStore = createSettingsStore();
      expect(reloadedStore.getState().defaultPlatformAgentProfileId).toBe(
        "platform_remote_custom"
      );
    } finally {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: originalLocalStorage
      });
    }
  });

  it("ignores blank platform run profile ids", () => {
    const store = createSettingsStore();
    const initialId = store.getState().defaultPlatformAgentProfileId;

    store.getState().setDefaultPlatformAgentProfile("   ");

    expect(store.getState().defaultPlatformAgentProfileId).toBe(initialId);
  });

  it("keeps the thin facade suite below the test maintainability budget", async () => {
    const code = await readFile(new URL("./settings-store.test.ts", import.meta.url), "utf-8");
    expect(code.split(/\r?\n/).length).toBeLessThan(260);
  });
});
