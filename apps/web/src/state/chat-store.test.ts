import { describe, expect, it, vi } from "vitest";

import { GatewayApiError } from "../services/api-client";
import { createChatStore } from "./chat-store";
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
    const compile = vi
      .fn()
      .mockRejectedValue(
        new GatewayApiError(
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
});
