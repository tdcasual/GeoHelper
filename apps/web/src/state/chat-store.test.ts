import { describe, expect, it, vi } from "vitest";

import { RuntimeApiError } from "../runtime/orchestrator";
import { createChatStore } from "./chat-store";
import { sceneStore } from "./scene-store";
import { settingsStore } from "./settings-store";

describe("chat-store", () => {
  it("stores compile result and appends assistant message", async () => {
    const compile = vi.fn().mockResolvedValue({
      batch: {
        version: "1.0",
        scene_id: "s1",
        transaction_id: "t1",
        commands: [],
        post_checks: [],
        explanations: []
      },
      agent_steps: [
        {
          name: "intent",
          status: "ok",
          duration_ms: 8
        }
      ]
    });
    const store = createChatStore({ compile });

    await store.getState().send("画一个圆");

    const message = store.getState().messages.at(-1);
    expect(message?.role).toBe("assistant");
    expect(message?.agentSteps?.[0]?.name).toBe("intent");
  });

  it("marks reauth required when official session expires", async () => {
    settingsStore.getState().setDefaultRuntimeProfile("runtime_gateway");
    const compile = vi
      .fn()
      .mockRejectedValue(
        new RuntimeApiError(
          "SESSION_EXPIRED",
          "Session token is invalid or expired",
          401
        )
      );
    const store = createChatStore({ compile });
    store.getState().setMode("official");
    store.getState().setSessionToken("expired-token");

    await store.getState().send("再画一个圆");

    expect(store.getState().sessionToken).toBeNull();
    expect(store.getState().reauthRequired).toBe(true);
    expect(store.getState().messages.at(-1)?.content).toContain("会话已过期");
    settingsStore.getState().setDefaultRuntimeProfile("runtime_direct");
  });

  it("isolates messages between conversations when switching", async () => {
    const compile = vi.fn().mockResolvedValue({
      batch: {
        version: "1.0",
        scene_id: "s1",
        transaction_id: "t1",
        commands: [],
        post_checks: [],
        explanations: []
      },
      agent_steps: []
    });
    const store = createChatStore({ compile });

    const firstConversationId = store.getState().activeConversationId;
    expect(firstConversationId).toEqual(expect.any(String));

    const secondConversationId = store.getState().createConversation();
    expect(secondConversationId).not.toBe(firstConversationId);

    await store.getState().send("第二个会话消息");
    expect(store.getState().messages.some((m) => m.content === "第二个会话消息")).toBe(
      true
    );

    store.getState().selectConversation(firstConversationId!);
    expect(store.getState().messages.some((m) => m.content === "第二个会话消息")).toBe(
      false
    );
  });

  it("retries compile when runtime options enable retries", async () => {
    const compile = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue({
        batch: {
          version: "1.0",
          scene_id: "s1",
          transaction_id: "t1",
          commands: [],
          post_checks: [],
          explanations: []
        },
        agent_steps: []
      });
    const resolveCompileOptions = vi.fn().mockResolvedValue({
      model: "gpt-4o-mini",
      byokEndpoint: "https://openrouter.ai/api/v1",
      byokKey: "sk-test",
      timeoutMs: 10_000,
      retryAttempts: 1,
      extraHeaders: {
        "x-client-strict-validation": "1"
      }
    });
    const store = createChatStore({
      compile,
      resolveCompileOptions,
      logEvent: vi.fn()
    });

    await store.getState().send("画一个圆");

    expect(resolveCompileOptions).toHaveBeenCalledTimes(1);
    expect(compile).toHaveBeenCalledTimes(2);
    expect(store.getState().messages.at(-1)?.role).toBe("assistant");
  });

  it("blocks byok request and opens settings when key decrypt recovery is required", async () => {
    settingsStore.getState().setDrawerOpen(false);
    settingsStore.getState().setByokRuntimeIssue(null);

    const compile = vi.fn();
    const resolveCompileOptions = vi.fn().mockResolvedValue({
      model: "gpt-4o-mini",
      retryAttempts: 0,
      extraHeaders: {},
      byokRuntimeIssue: {
        code: "BYOK_KEY_DECRYPT_FAILED",
        presetId: "byok_1",
        presetName: "OpenRouter",
        message: "BYOK Key 解密失败，请重新填写 API Key"
      }
    });
    const store = createChatStore({
      compile,
      resolveCompileOptions,
      logEvent: vi.fn()
    });

    await store.getState().send("画一个圆");

    expect(compile).not.toHaveBeenCalled();
    expect(store.getState().messages.at(-1)?.content).toContain("BYOK 密钥不可用");
    expect(settingsStore.getState().drawerOpen).toBe(true);

    settingsStore.getState().setDrawerOpen(false);
    settingsStore.getState().setByokRuntimeIssue(null);
  });

  it("includes recent conversation and scene context in compile request", async () => {
    sceneStore.getState().clearHistory();
    sceneStore.getState().recordTransaction({
      version: "1.0",
      scene_id: "scene_ctx",
      transaction_id: "tx_ctx",
      commands: [],
      post_checks: [],
      explanations: []
    });

    const compile = vi.fn().mockResolvedValue({
      batch: {
        version: "1.0",
        scene_id: "s1",
        transaction_id: "t1",
        commands: [],
        post_checks: [],
        explanations: []
      },
      agent_steps: []
    });
    const store = createChatStore({ compile });

    await store.getState().send("先画一个圆");
    await store.getState().send("再加一条切线");

    const latestCall = compile.mock.calls.at(-1)?.[0] as {
      context?: {
        recentMessages?: Array<{ role: "user" | "assistant"; content: string }>;
        sceneTransactions?: Array<{
          sceneId: string;
          transactionId: string;
          commandCount: number;
        }>;
      };
    };
    expect(
      latestCall.context?.recentMessages?.some((item) => item.content === "先画一个圆")
    ).toBe(true);
    expect(
      latestCall.context?.sceneTransactions?.some(
        (item) => item.transactionId === "tx_ctx"
      )
    ).toBe(true);

    sceneStore.getState().clearHistory();
  });

  it("skips compile when runtime does not support official mode", async () => {
    const compile = vi.fn();
    const resolveCompileOptions = vi.fn().mockResolvedValue({
      runtimeTarget: "direct",
      runtimeBaseUrl: undefined,
      runtimeCapabilities: {
        supportsOfficialAuth: false,
        supportsAgentSteps: false,
        supportsServerMetrics: false,
        supportsRateLimitHeaders: false
      },
      model: "gpt-4o-mini",
      retryAttempts: 0,
      extraHeaders: {}
    });
    const store = createChatStore({
      compile,
      resolveCompileOptions,
      logEvent: vi.fn()
    });
    store.getState().setMode("official");

    await store.getState().send("画一个圆");

    expect(compile).not.toHaveBeenCalled();
    expect(store.getState().messages.at(-1)?.content).toContain(
      "不支持 Official 模式"
    );
  });
});
