import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createSettingsStore,
  SETTINGS_KEY} from "./settings-store";
import { createMemoryStorage } from "./settings-store.test-helpers";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("settings-store secrets", () => {
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
      expect(globalThis.localStorage.getItem(SETTINGS_KEY) ?? "").not.toContain(
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
