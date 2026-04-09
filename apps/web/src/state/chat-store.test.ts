import { describe, expect, it, vi } from "vitest";

import { getPlatformRunProfile } from "../runtime/platform-run-profiles";
import { RuntimeApiError } from "../runtime/runtime-service";
import { createRuntimeRunResponseFixture } from "../test-utils/platform-run-fixture";
import { createChatStore } from "./chat-store";
import { sceneStore } from "./scene-store";
import { settingsStore } from "./settings-store";

const createRunResponse = (
  overrides: Parameters<typeof createRuntimeRunResponseFixture>[0] = {}
) => createRuntimeRunResponseFixture(overrides);

describe("chat-store", () => {
  it("stores run result and appends assistant message", async () => {
    const submitPrompt = vi.fn().mockResolvedValue(
      createRunResponse({
        run: {
          id: "run_store"
        },
        events: [
          {
            id: "event_1",
            runId: "run_store",
            sequence: 1,
            type: "run.created",
            payload: {},
            createdAt: "2026-04-04T00:00:00.000Z"
          },
          {
            id: "event_2",
            runId: "run_store",
            sequence: 2,
            type: "node.completed",
            payload: {
              nodeId: "node_plan_geometry",
              resultType: "continue",
              durationMs: 8
            },
            createdAt: "2026-04-04T00:00:01.000Z"
          }
        ]
      })
    );
    const store = createChatStore({ submitPrompt });

    await store.getState().send("画一个圆");

    const message = store.getState().messages.at(-1);
    expect(message?.role).toBe("assistant");
    expect(message?.platformRunId).toBe("run_store");
    expect(message?.agentSteps?.[0]?.name).toBe("node_plan_geometry");
  });

  it("dispatches proof-assist follow-up prompts as explicit user requests", async () => {
    const submitPrompt = vi.fn().mockResolvedValue(createRunResponse());
    const store = createChatStore({ submitPrompt });

    await store
      .getState()
      .sendFollowUpPrompt("请基于当前图形补辅助线，并说明每条辅助线的作用。");

    expect(store.getState().messages[0]?.role).toBe("user");
    expect(store.getState().messages[0]?.content).toContain("补辅助线");
    expect(submitPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "请基于当前图形补辅助线，并说明每条辅助线的作用。"
      })
    );
  });

  it("ignores empty proof-assist follow-up prompts", async () => {
    const submitPrompt = vi.fn();
    const store = createChatStore({ submitPrompt });

    await store.getState().sendFollowUpPrompt("   ");

    expect(submitPrompt).not.toHaveBeenCalled();
    expect(store.getState().messages).toEqual([]);
  });

  it("marks reauth required when official session expires", async () => {
    settingsStore.getState().setDefaultRuntimeProfile("runtime_gateway");
    const submitPrompt = vi
      .fn()
      .mockRejectedValue(
        new RuntimeApiError(
          "SESSION_EXPIRED",
          "Session token is invalid or expired",
          401
        )
      );
    const store = createChatStore({ submitPrompt });
    store.getState().setMode("official");
    store.getState().setSessionToken("expired-token");

    await store.getState().send("再画一个圆");

    expect(store.getState().sessionToken).toBeNull();
    expect(store.getState().reauthRequired).toBe(true);
    expect(store.getState().messages.at(-1)?.content).toContain("会话已过期");
    settingsStore.getState().setDefaultRuntimeProfile("runtime_direct");
  });

  it("isolates messages between conversations when switching", async () => {
    const submitPrompt = vi.fn().mockResolvedValue(createRunResponse());
    const store = createChatStore({ submitPrompt });

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

  it("stores image attachments on user messages and forwards them to prompt submission", async () => {
    const submitPrompt = vi.fn().mockResolvedValue(createRunResponse());
    const resolveRunOptions = vi.fn().mockResolvedValue({
      runtimeTarget: "direct",
      providerBaseUrl: "https://openrouter.ai/api/v1",
      runtimeCapabilities: {
        supportsOfficialAuth: false,
        supportsVision: true,
        supportsAgentSteps: false,
        supportsServerMetrics: false,
        supportsRateLimitHeaders: false
      },
      model: "gpt-4o",
      retryAttempts: 0,
      extraHeaders: {}
    });
    const store = createChatStore({ submitPrompt, resolveRunOptions });
    const attachments = [
      {
        id: "img_1",
        kind: "image" as const,
        name: "triangle.png",
        mimeType: "image/png",
        size: 1234,
        previewUrl: "blob:triangle",
        transportPayload: "data:image/png;base64,AAAA"
      }
    ];

    await store.getState().send({
      content: "根据这张图画三角形",
      attachments
    } as never);

    const userMessage = store
      .getState()
      .messages.find((message) => message.role === "user");
    expect(userMessage?.attachments).toEqual(attachments);
    expect(submitPrompt.mock.calls[0]?.[0]?.attachments).toEqual(attachments);
  });

  it("forwards the resolved platform run profile into prompt submission", async () => {
    const submitPrompt = vi.fn().mockResolvedValue(createRunResponse());
    const resolveRunOptions = vi.fn().mockResolvedValue({
      runtimeTarget: "gateway",
      gatewayBaseUrl: "https://gateway.example.com",
      controlPlaneBaseUrl: "https://control-plane.example.com",
      runtimeCapabilities: {
        supportsOfficialAuth: true,
        supportsVision: false,
        supportsAgentSteps: true,
        supportsServerMetrics: true,
        supportsRateLimitHeaders: true
      },
      retryAttempts: 0,
      extraHeaders: {},
      platformRunProfile: getPlatformRunProfile("platform_geometry_quick_draft")
    });
    const store = createChatStore({
      submitPrompt,
      resolveRunOptions
    });

    await store.getState().send("先出一个快速草稿");

    expect(submitPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        platformRunProfile: getPlatformRunProfile(
          "platform_geometry_quick_draft"
        )
      })
    );
  });

  it("retries prompt submission when runtime options enable retries", async () => {
    const submitPrompt = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue(createRunResponse());
    const resolveRunOptions = vi.fn().mockResolvedValue({
      model: "gpt-4o-mini",
      byokEndpoint: "https://openrouter.ai/api/v1",
      byokKey: "sk-test",
      timeoutMs: 10_000,
      retryAttempts: 1,
      extraHeaders: {}
    });
    const store = createChatStore({
      submitPrompt,
      resolveRunOptions,
      logEvent: vi.fn()
    });

    await store.getState().send("画一个圆");

    expect(resolveRunOptions).toHaveBeenCalledTimes(1);
    expect(submitPrompt).toHaveBeenCalledTimes(2);
    expect(store.getState().messages.at(-1)?.role).toBe("assistant");
  });

  it("blocks byok request and opens settings when key decrypt recovery is required", async () => {
    settingsStore.getState().setDrawerOpen(false);
    settingsStore.getState().setByokRuntimeIssue(null);

    const submitPrompt = vi.fn();
    const resolveRunOptions = vi.fn().mockResolvedValue({
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
      submitPrompt,
      resolveRunOptions,
      logEvent: vi.fn()
    });

    await store.getState().send("画一个圆");

    expect(submitPrompt).not.toHaveBeenCalled();
    expect(store.getState().messages.at(-1)?.content).toContain("BYOK 密钥不可用");
    expect(settingsStore.getState().drawerOpen).toBe(true);

    settingsStore.getState().setDrawerOpen(false);
    settingsStore.getState().setByokRuntimeIssue(null);
  });

  it("includes recent conversation and scene context in run request", async () => {
    sceneStore.getState().clearHistory();
    sceneStore.getState().recordTransaction({
      version: "1.0",
      scene_id: "scene_ctx",
      transaction_id: "tx_ctx",
      commands: [],
      post_checks: [],
      explanations: []
    });

    const submitPrompt = vi.fn().mockResolvedValue(createRunResponse());
    const store = createChatStore({ submitPrompt });

    await store.getState().send("先画一个圆");
    await store.getState().send("再加一条切线");

    const latestCall = submitPrompt.mock.calls.at(-1)?.[0] as {
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

  it("blocks attachment sends before prompt submission when runtime capability disables vision", async () => {
    const submitPrompt = vi.fn();
    const resolveRunOptions = vi.fn().mockResolvedValue({
      runtimeTarget: "gateway",
      gatewayBaseUrl: "https://gateway.example.com",
      controlPlaneBaseUrl: "https://control-plane.example.com",
      runtimeCapabilities: {
        supportsOfficialAuth: true,
        supportsVision: false,
        supportsAgentSteps: true,
        supportsServerMetrics: true,
        supportsRateLimitHeaders: true
      },
      model: "gpt-4.1-mini",
      retryAttempts: 0,
      extraHeaders: {}
    });
    const store = createChatStore({
      submitPrompt,
      resolveRunOptions,
      logEvent: vi.fn()
    });

    await store.getState().send({
      content: "根据图片画出三角形",
      attachments: [
        {
          id: "img_1",
          kind: "image",
          name: "triangle.png",
          mimeType: "image/png",
          size: 1234,
          previewUrl: "blob:triangle",
          transportPayload: "data:image/png;base64,AAAA"
        }
      ]
    } as never);

    expect(submitPrompt).not.toHaveBeenCalled();
    expect(store.getState().messages.at(-1)?.content).toContain("图片能力");
  });

  it("skips prompt submission when runtime does not support official mode", async () => {
    const submitPrompt = vi.fn();
    const resolveRunOptions = vi.fn().mockResolvedValue({
      runtimeTarget: "direct",
      providerBaseUrl: undefined,
      runtimeCapabilities: {
        supportsOfficialAuth: false,
        supportsVision: true,
        supportsAgentSteps: false,
        supportsServerMetrics: false,
        supportsRateLimitHeaders: false
      },
      model: "gpt-4o-mini",
      retryAttempts: 0,
      extraHeaders: {}
    });
    const store = createChatStore({
      submitPrompt,
      resolveRunOptions,
      logEvent: vi.fn()
    });
    store.getState().setMode("official");

    await store.getState().send("画一个圆");

    expect(submitPrompt).not.toHaveBeenCalled();
    expect(store.getState().messages.at(-1)?.content).toContain(
      "不支持 Official 模式"
    );
  });
});
