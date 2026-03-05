import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

import {
  createSettingsStore,
  settingsStore,
  resolveCompileRuntimeOptions
} from "./settings-store";

describe("settings-store", () => {
  it("creates and updates byok preset with encrypted key", async () => {
    const secret = {
      encrypt: vi.fn(async (value: string) => ({
        version: 1 as const,
        algorithm: "AES-GCM" as const,
        iv: "iv",
        ciphertext: `enc:${value}`
      })),
      decrypt: vi.fn(async (payload: { ciphertext: string }) =>
        payload.ciphertext.replace("enc:", "")
      ),
      clear: vi.fn(async () => undefined)
    };
    const store = createSettingsStore({
      secretService: secret
    });

    const presetId = await store.getState().upsertByokPreset({
      name: "OpenRouter",
      model: "openai/gpt-4o-mini",
      endpoint: "https://openrouter.ai/api/v1",
      temperature: 0.2,
      maxTokens: 1000,
      timeoutMs: 20000,
      apiKey: "sk-live"
    });

    const preset = store
      .getState()
      .byokPresets.find((item) => item.id === presetId);
    expect(secret.encrypt).toHaveBeenCalledWith("sk-live");
    expect(preset?.apiKeyCipher?.ciphertext).toBe("enc:sk-live");
  });

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

  it("defaults runtime profile to direct when gateway env is absent", () => {
    vi.unstubAllEnvs();
    const store = createSettingsStore();

    const runtimeProfile = store
      .getState()
      .runtimeProfiles.find(
        (item) => item.id === store.getState().defaultRuntimeProfileId
      );

    expect(runtimeProfile?.target).toBe("direct");
  });

  it("resolves runtime compile options with runtime target and capabilities", async () => {
    vi.stubEnv("VITE_GATEWAY_URL", "https://gateway.env.example.com");
    settingsStore.getState().upsertRuntimeProfile({
      id: "runtime_gateway",
      name: "Gateway",
      target: "gateway",
      baseUrl: "https://gateway.env.example.com"
    });
    settingsStore.getState().setDefaultRuntimeProfile("runtime_gateway");

    const options = await resolveCompileRuntimeOptions({
      conversationId: "conv_1",
      mode: "official"
    });

    expect(options.runtimeTarget).toBe("gateway");
    expect(options.runtimeBaseUrl).toBe("https://gateway.env.example.com");
    expect(options.runtimeCapabilities.supportsOfficialAuth).toBe(true);
  });

  it("avoids direct process.env access for gateway URL", async () => {
    const code = await readFile(
      new URL("./settings-store.ts", import.meta.url),
      "utf-8"
    );
    expect(code).not.toContain("process.env.VITE_GATEWAY_URL");
  });
});
