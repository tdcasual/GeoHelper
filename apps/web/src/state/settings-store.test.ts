import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createSettingsStore,
  inferModelSupportsVision,
  resolveCompileRuntimeOptions,
  resolveRuntimeCapabilitiesForModel,
  settingsStore,
  SETTINGS_KEY
} from "./settings-store";

const createMemoryStorage = (): Storage => {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    }
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

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

  it("defaults runtime profile to gateway when gateway env is absent", () => {
    vi.unstubAllEnvs();
    const store = createSettingsStore();

    const runtimeProfile = store
      .getState()
      .runtimeProfiles.find(
        (item) => item.id === store.getState().defaultRuntimeProfileId
      );

    expect(runtimeProfile?.target).toBe("gateway");
  });

  it("derives vision capability from runtime target and model", () => {
    expect(
      resolveRuntimeCapabilitiesForModel({
        runtimeTarget: "direct",
        model: "gpt-4.1-mini"
      }).supportsVision
    ).toBe(false);
    expect(
      resolveRuntimeCapabilitiesForModel({
        runtimeTarget: "direct",
        model: "gpt-4o"
      }).supportsVision
    ).toBe(true);
    expect(
      resolveRuntimeCapabilitiesForModel({
        runtimeTarget: "gateway",
        model: "gpt-4o"
      }).supportsVision
    ).toBe(false);
  });

  it("recognizes common multimodal model names", () => {
    expect(inferModelSupportsVision("gpt-4o")).toBe(true);
    expect(inferModelSupportsVision("claude-3.7-sonnet")).toBe(true);
    expect(inferModelSupportsVision("gemini-2.0-flash")).toBe(true);
    expect(inferModelSupportsVision("gpt-4.1-mini")).toBe(false);
  });

  it("resolves runtime compile options with hydrated gateway capabilities", async () => {
    vi.stubEnv("VITE_GATEWAY_URL", "https://gateway-capable.example.com");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          git_sha: "sha123",
          build_time: "2026-03-12T00:00:00.000Z",
          node_env: "production",
          redis_enabled: true,
          attachments_enabled: true
        })
      })
    );
    settingsStore.getState().upsertRuntimeProfile({
      id: "runtime_gateway",
      name: "Gateway",
      target: "gateway",
      baseUrl: "https://gateway-capable.example.com"
    });
    settingsStore.getState().setDefaultRuntimeProfile("runtime_gateway");

    const options = await resolveCompileRuntimeOptions({
      conversationId: "conv_1",
      mode: "official"
    });

    expect(options.runtimeTarget).toBe("gateway");
    expect(options.runtimeBaseUrl).toBe("https://gateway-capable.example.com");
    expect(options.runtimeCapabilities.supportsOfficialAuth).toBe(true);
    expect(options.runtimeCapabilities.supportsVision).toBe(true);
  });

  it("avoids direct process.env access for gateway URL", async () => {
    const code = await readFile(
      new URL("./settings-store.ts", import.meta.url),
      "utf-8"
    );
    expect(code).not.toContain("process.env.VITE_GATEWAY_URL");
  });

  it("stores, reads, and clears the encrypted remote backup admin token", async () => {
    const originalLocalStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: createMemoryStorage()
    });

    try {
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

    await store.getState().setRemoteBackupAdminToken("admin-secret");

    expect(secret.encrypt).toHaveBeenCalledWith("admin-secret");
    expect(store.getState().remoteBackupAdminTokenCipher?.ciphertext).toBe(
      "enc:admin-secret"
    );

    const reloaded = createSettingsStore({
      secretService: secret
    });
    await expect(reloaded.getState().readRemoteBackupAdminToken()).resolves.toBe(
      "admin-secret"
    );
    expect(secret.decrypt).toHaveBeenCalledWith(
      expect.objectContaining({ ciphertext: "enc:admin-secret" })
    );

    reloaded.getState().clearRemoteBackupAdminToken();
    expect(reloaded.getState().remoteBackupAdminTokenCipher).toBeUndefined();

    const cleared = createSettingsStore({
      secretService: secret
    });
    await expect(cleared.getState().readRemoteBackupAdminToken()).resolves.toBeNull();
    expect(globalThis.localStorage.getItem(SETTINGS_KEY)).not.toContain(
      "enc:admin-secret"
    );
  } finally {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: originalLocalStorage
    });
  }
  });

});
