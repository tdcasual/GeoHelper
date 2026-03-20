import { describe, expect, it } from "vitest";

import {
  buildCompileRuntimeOptions,
  maybeAppendDebugEvent
} from "./settings-runtime-resolver";
import type { DebugEvent } from "./settings-store";
import { createSettingsStore } from "./settings-store";

const createDebugEvent = (
  overrides: Partial<DebugEvent> = {}
): DebugEvent => ({
  id: overrides.id ?? "dbg_1",
  time: overrides.time ?? 1_763_280_000_000,
  level: overrides.level ?? "info",
  message: overrides.message ?? "event"
});

describe("settings-runtime-resolver", () => {
  it("builds byok runtime options and surfaces decrypt failures", async () => {
    const secretService = {
      encrypt: async (value: string) => ({
        version: 1 as const,
        algorithm: "AES-GCM" as const,
        iv: "iv",
        ciphertext: `enc:${value}`
      }),
      decrypt: async () => {
        throw new Error("decrypt failed");
      },
      clear: async () => undefined
    };
    const store = createSettingsStore({
      secretService
    });

    await store.getState().upsertByokPreset({
      id: store.getState().defaultByokPresetId,
      name: "OpenRouter",
      model: "openai/gpt-4o-mini",
      endpoint: "https://openrouter.ai/api/v1",
      temperature: 0.2,
      maxTokens: 1000,
      timeoutMs: 20_000,
      apiKey: "sk-live"
    });
    store.getState().upsertRuntimeProfile({
      id: "runtime_direct",
      name: "Direct BYOK",
      target: "direct",
      baseUrl: "https://direct.example.com"
    });
    store.getState().setDefaultRuntimeProfile("runtime_direct");

    const result = await buildCompileRuntimeOptions({
      state: store.getState(),
      conversationId: "conv_1",
      mode: "byok",
      secretService,
      resolveCapabilities: async () => ({
        supportsOfficialAuth: false,
        supportsVision: true,
        supportsAgentSteps: false,
        supportsServerMetrics: false,
        supportsRateLimitHeaders: false
      })
    });

    expect(result.byokEndpoint).toBe("https://openrouter.ai/api/v1");
    expect(result.byokRuntimeIssue?.code).toBe("BYOK_KEY_DECRYPT_FAILED");
    expect(result.byokKey).toBeUndefined();
  });

  it("does not emit legacy compile client flags into active runtime headers", async () => {
    const store = createSettingsStore();
    store.getState().setExperimentFlag("strictValidationEnabled", true);
    store.getState().setExperimentFlag("fallbackSingleAgentEnabled", true);
    store.getState().setExperimentFlag("performanceSamplingEnabled", true);

    const result = await buildCompileRuntimeOptions({
      state: store.getState(),
      conversationId: "conv_1",
      mode: "byok",
      resolveCapabilities: async () => ({
        supportsOfficialAuth: true,
        supportsVision: false,
        supportsAgentSteps: true,
        supportsServerMetrics: true,
        supportsRateLimitHeaders: true
      })
    });

    expect(result.extraHeaders).toEqual({});
  });

  it("only appends debug events when debugLogPanelEnabled is on", () => {
    const store = createSettingsStore();
    const state = store.getState();
    const event = createDebugEvent({
      level: "error",
      message: "Decrypt failed"
    });

    expect(
      maybeAppendDebugEvent(state, event)
    ).toEqual([]);

    expect(
      maybeAppendDebugEvent(
        {
          ...state,
          experimentFlags: {
            ...state.experimentFlags,
            debugLogPanelEnabled: true
          }
        },
        event
      )
    ).toEqual([event]);
  });
});
