import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import { platformRunProfiles } from "../runtime/platform-run-profiles";
import { browserSecretService } from "../services/secure-secret";
import {
  createSettingsStore,
  inferModelSupportsVision,
  resolveCompileRuntimeOptions,
  resolveRuntimeCapabilitiesForModel,
  settingsStore
} from "./settings-store";
import { createMemoryStorage } from "./settings-store.test-helpers";

const createJsonResponse = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("settings-store runtime", () => {
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

  it("resolves runtime compile options with gateway capabilities", async () => {
    vi.stubEnv("VITE_GATEWAY_URL", "https://gateway-capable.example.com");
    const originalState = settingsStore.getState();

    try {
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
      expect(options.runtimeCapabilities.supportsVision).toBe(false);
    } finally {
      settingsStore.setState(() => originalState);
    }
  });

  it("refreshes platform run profiles from control plane and heals a missing selection", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      createJsonResponse({
        catalog: {
          runProfiles: [
            {
              id: "platform_remote_geometry_pro",
              name: "远端几何增强",
              description: "control-plane 下发的增强版本",
              agentId: "geometry_solver",
              workflowId: "wf_geometry_solver",
              defaultBudget: {
                maxModelCalls: 9,
                maxToolCalls: 12,
                maxDurationMs: 180000
              }
            },
            {
              id: "platform_remote_geometry_fast",
              name: "远端快速版",
              description: "control-plane 下发的快速版本",
              agentId: "geometry_solver",
              workflowId: "wf_geometry_solver",
              defaultBudget: {
                maxModelCalls: 4,
                maxToolCalls: 5,
                maxDurationMs: 90000
              }
            }
          ]
        }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const store = createSettingsStore();
    store.getState().upsertRuntimeProfile({
      id: "runtime_gateway",
      name: "Gateway",
      target: "gateway",
      baseUrl: "https://control-plane.example.com"
    });
    store.getState().setDefaultRuntimeProfile("runtime_gateway");
    store
      .getState()
      .setDefaultPlatformAgentProfile("platform_remote_missing");

    await store.getState().refreshPlatformRunProfiles();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://control-plane.example.com/api/v3/platform/catalog",
      undefined
    );
    expect(store.getState().platformRunProfileCatalog).toEqual(
      expect.objectContaining({
        source: "control_plane",
        status: "ready",
        error: null,
        profiles: [
          expect.objectContaining({
            id: "platform_remote_geometry_pro"
          }),
          expect.objectContaining({
            id: "platform_remote_geometry_fast"
          })
        ]
      })
    );
    expect(store.getState().defaultPlatformAgentProfileId).toBe(
      "platform_remote_geometry_pro"
    );
  });

  it("falls back to the local platform run profile catalog when refresh fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockRejectedValueOnce(new Error("catalog offline"))
    );

    const store = createSettingsStore();
    store.getState().upsertRuntimeProfile({
      id: "runtime_gateway",
      name: "Gateway",
      target: "gateway",
      baseUrl: "https://control-plane.example.com"
    });
    store.getState().setDefaultRuntimeProfile("runtime_gateway");

    await store.getState().refreshPlatformRunProfiles();

    expect(store.getState().platformRunProfileCatalog).toEqual(
      expect.objectContaining({
        source: "local",
        status: "error",
        error: "catalog offline",
        profiles: platformRunProfiles
      })
    );
  });

  it("keeps resolveCompileRuntimeOptions facade wiring store state updates", async () => {
    const originalLocalStorage = globalThis.localStorage;
    const originalState = settingsStore.getState();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: createMemoryStorage()
    });
    const encryptSpy = vi.spyOn(browserSecretService, "encrypt").mockResolvedValue({
      version: 1,
      algorithm: "AES-GCM",
      iv: "iv",
      ciphertext: "enc:sk-live"
    });
    const decryptSpy = vi
      .spyOn(browserSecretService, "decrypt")
      .mockRejectedValue(new Error("decrypt failed"));

    await settingsStore.getState().upsertByokPreset({
      id: settingsStore.getState().defaultByokPresetId,
      name: "OpenRouter",
      model: "openai/gpt-4o-mini",
      endpoint: "https://openrouter.ai/api/v1",
      temperature: 0.2,
      maxTokens: 1000,
      timeoutMs: 20_000,
      apiKey: "sk-live"
    });
    settingsStore.getState().setExperimentFlag("debugLogPanelEnabled", true);
    settingsStore.getState().setByokRuntimeIssue(null);
    settingsStore.getState().clearDebugEvents();

    try {
      const options = await resolveCompileRuntimeOptions({
        conversationId: "conv_1",
        mode: "byok"
      });

      expect(encryptSpy).toHaveBeenCalledWith("sk-live");
      expect(decryptSpy).toHaveBeenCalled();
      expect(options.byokRuntimeIssue?.code).toBe("BYOK_KEY_DECRYPT_FAILED");
      expect(settingsStore.getState().byokRuntimeIssue?.code).toBe(
        "BYOK_KEY_DECRYPT_FAILED"
      );
      expect(settingsStore.getState().debugEvents[0]?.message).toBe(
        "BYOK Key 解密失败，已跳过本次 key 注入"
      );
    } finally {
      encryptSpy.mockRestore();
      decryptSpy.mockRestore();
      settingsStore.setState(() => originalState);
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: originalLocalStorage
      });
    }
  });

  it("avoids direct process.env access for gateway URL", async () => {
    const code = await readFile(
      new URL("./settings-store.ts", import.meta.url),
      "utf-8"
    );
    expect(code).not.toContain("process.env.VITE_GATEWAY_URL");
  });
});
