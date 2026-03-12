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

  it("persists lightweight cloud sync mode preference", () => {
    const originalLocalStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: createMemoryStorage()
    });

    try {
      const store = createSettingsStore();
      expect(store.getState().remoteBackupSyncPreferences.mode).toBe("off");

      store.getState().setRemoteBackupSyncMode("delayed_upload");
      expect(store.getState().remoteBackupSyncPreferences.mode).toBe(
        "delayed_upload"
      );

      const reloaded = createSettingsStore();
      expect(reloaded.getState().remoteBackupSyncPreferences.mode).toBe(
        "delayed_upload"
      );
    } finally {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: originalLocalStorage
      });
    }
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

  it("tracks lightweight remote backup sync states from compare results", () => {
    const store = createSettingsStore();

    expect(store.getState().remoteBackupSync.status).toBe("idle");

    store.getState().beginRemoteBackupSyncCheck();
    expect(store.getState().remoteBackupSync.status).toBe("checking");

    const remoteSummary = {
      stored_at: "2026-03-12T10:00:00.000Z",
      schema_version: 2,
      created_at: "2026-03-12T09:58:00.000Z",
      updated_at: "2026-03-12T09:59:00.000Z",
      app_version: "0.0.1",
      checksum: "checksum-remote",
      conversation_count: 2,
      snapshot_id: "snap-remote",
      device_id: "device-remote"
    };

    store.getState().setRemoteBackupSyncResult({
      latestRemoteBackup: remoteSummary,
      history: [remoteSummary],
      comparison: {
        local_status: "summary",
        remote_status: "available",
        comparison_result: "identical",
        local_snapshot: {
          summary: {
            schema_version: 2,
            created_at: "2026-03-12T09:58:00.000Z",
            updated_at: "2026-03-12T09:59:00.000Z",
            app_version: "0.0.1",
            checksum: "checksum-remote",
            conversation_count: 2,
            snapshot_id: "snap-remote",
            device_id: "device-local"
          }
        },
        remote_snapshot: {
          summary: remoteSummary
        },
        build: {
          git_sha: "backupsha",
          build_time: "2026-03-12T09:59:30.000Z",
          node_env: "production",
          redis_enabled: true,
          attachments_enabled: false
        }
      },
      checkedAt: "2026-03-12T10:01:00.000Z"
    });
    expect(store.getState().remoteBackupSync.status).toBe("up_to_date");

    store.getState().setRemoteBackupSyncResult({
      comparison: {
        local_status: "summary",
        remote_status: "missing",
        comparison_result: "local_newer",
        local_snapshot: {
          summary: {
            schema_version: 2,
            created_at: "2026-03-12T10:02:00.000Z",
            updated_at: "2026-03-12T10:02:00.000Z",
            app_version: "0.0.1",
            checksum: "checksum-local",
            conversation_count: 3,
            snapshot_id: "snap-local",
            device_id: "device-local"
          }
        },
        remote_snapshot: null,
        build: {
          git_sha: "backupsha",
          build_time: "2026-03-12T10:02:30.000Z",
          node_env: "production",
          redis_enabled: true,
          attachments_enabled: false
        }
      }
    });
    expect(store.getState().remoteBackupSync.status).toBe("local_newer");

    store.getState().setRemoteBackupSyncResult({
      comparison: {
        local_status: "summary",
        remote_status: "available",
        comparison_result: "remote_newer",
        local_snapshot: {
          summary: {
            schema_version: 2,
            created_at: "2026-03-12T10:02:00.000Z",
            updated_at: "2026-03-12T10:02:00.000Z",
            app_version: "0.0.1",
            checksum: "checksum-local",
            conversation_count: 3,
            snapshot_id: "snap-local",
            device_id: "device-local"
          }
        },
        remote_snapshot: {
          summary: remoteSummary
        },
        build: {
          git_sha: "backupsha",
          build_time: "2026-03-12T10:03:30.000Z",
          node_env: "production",
          redis_enabled: true,
          attachments_enabled: false
        }
      }
    });
    expect(store.getState().remoteBackupSync.status).toBe("remote_newer");

    store.getState().setRemoteBackupSyncResult({
      comparison: {
        local_status: "summary",
        remote_status: "available",
        comparison_result: "diverged",
        local_snapshot: {
          summary: {
            schema_version: 2,
            created_at: "2026-03-12T10:04:00.000Z",
            updated_at: "2026-03-12T10:04:00.000Z",
            app_version: "0.0.1",
            checksum: "checksum-local-2",
            conversation_count: 4,
            snapshot_id: "snap-local-2",
            device_id: "device-local"
          }
        },
        remote_snapshot: {
          summary: remoteSummary
        },
        build: {
          git_sha: "backupsha",
          build_time: "2026-03-12T10:04:30.000Z",
          node_env: "production",
          redis_enabled: true,
          attachments_enabled: false
        }
      }
    });
    expect(store.getState().remoteBackupSync.status).toBe("diverged");
    expect(store.getState().remoteBackupSync.history).toEqual([remoteSummary]);
    expect(store.getState().remoteBackupSync.latestRemoteBackup).toEqual(remoteSummary);
  });

  it("keeps gateway-unavailable sync checks explicit and non-fatal", () => {
    const store = createSettingsStore();

    store.getState().beginRemoteBackupSyncCheck();
    store.getState().setRemoteBackupSyncError("Gateway unavailable");

    expect(store.getState().remoteBackupSync.status).toBe("idle");
    expect(store.getState().remoteBackupSync.lastError).toBe(
      "Gateway unavailable"
    );
    expect(store.getState().remoteBackupSync.lastComparison).toBeNull();
  });

  it("tracks guarded upload statuses without dropping remote summary metadata", () => {
    const store = createSettingsStore();
    const remoteSummary = {
      stored_at: "2026-03-12T10:10:00.000Z",
      schema_version: 2,
      created_at: "2026-03-12T10:08:00.000Z",
      updated_at: "2026-03-12T10:09:00.000Z",
      app_version: "0.0.1",
      checksum: "checksum-remote",
      conversation_count: 2,
      snapshot_id: "snap-remote",
      device_id: "device-remote"
    };
    const comparison = {
      local_status: "summary" as const,
      remote_status: "available" as const,
      comparison_result: "remote_newer" as const,
      local_snapshot: {
        summary: {
          schema_version: 2,
          created_at: "2026-03-12T10:08:00.000Z",
          updated_at: "2026-03-12T10:08:30.000Z",
          app_version: "0.0.1",
          checksum: "checksum-local",
          conversation_count: 1,
          snapshot_id: "snap-local",
          device_id: "device-local"
        }
      },
      remote_snapshot: {
        summary: remoteSummary
      },
      build: {
        git_sha: "backupsha",
        build_time: "2026-03-12T10:10:30.000Z",
        node_env: "production",
        redis_enabled: true,
        attachments_enabled: false
      }
    };

    store.getState().beginRemoteBackupSyncUpload();
    expect(store.getState().remoteBackupSync.status).toBe("uploading");

    store.getState().setRemoteBackupSyncResult({
      status: "upload_blocked_remote_newer",
      latestRemoteBackup: remoteSummary,
      history: [remoteSummary],
      comparison,
      checkedAt: "2026-03-12T10:11:00.000Z"
    });
    expect(store.getState().remoteBackupSync.status).toBe(
      "upload_blocked_remote_newer"
    );
    expect(store.getState().remoteBackupSync.latestRemoteBackup).toEqual(
      remoteSummary
    );

    store.getState().setRemoteBackupSyncResult({
      status: "force_upload_required",
      comparison,
      checkedAt: "2026-03-12T10:12:00.000Z"
    });
    expect(store.getState().remoteBackupSync.status).toBe(
      "force_upload_required"
    );

    store.getState().setRemoteBackupSyncResult({
      status: "upload_conflict",
      comparison,
      checkedAt: "2026-03-12T10:13:00.000Z"
    });
    expect(store.getState().remoteBackupSync.status).toBe("upload_conflict");
    expect(store.getState().remoteBackupSync.latestRemoteBackup).toEqual(
      remoteSummary
    );
    expect(store.getState().remoteBackupSync.history).toEqual([remoteSummary]);
  });
});
