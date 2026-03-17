import { describe, expect, it, vi } from "vitest";

import type { ChatStoreDeps, ChatStoreState } from "./chat-store";
import { createChatStoreActions } from "./chat-store-actions";
import type { PersistableChatState } from "./chat-store-helpers";

const createBaseState = (): ChatStoreState => ({
  mode: "byok",
  sessionToken: null,
  conversations: [],
  activeConversationId: null,
  messages: [],
  isSending: false,
  reauthRequired: false,
  setMode: () => undefined,
  setSessionToken: () => undefined,
  createConversation: () => "",
  selectConversation: () => undefined,
  acknowledgeReauth: () => undefined,
  send: async () => undefined,
  sendFollowUpPrompt: async () => undefined
});

const createDeps = (): ChatStoreDeps => ({
  compile: vi.fn(),
  execute: vi.fn(),
  resolveCompileOptions: vi.fn(),
  logEvent: vi.fn()
});

const createActionHarness = (
  stateOverride: Partial<ChatStoreState> = {},
  depsOverride: Partial<ChatStoreDeps> = {}
) => {
  let state: ChatStoreState = {
    ...createBaseState(),
    ...stateOverride
  };
  const saveState = vi.fn<(snapshot: PersistableChatState) => void>();
  const set = (
    partial:
      | Partial<ChatStoreState>
      | ((state: ChatStoreState) => Partial<ChatStoreState>)
  ) => {
    const next = typeof partial === "function" ? partial(state) : partial;
    state = {
      ...state,
      ...next
    };
  };
  const get = () => state;
  const actions = createChatStoreActions({
    set,
    get,
    saveState,
    deps: {
      ...createDeps(),
      ...depsOverride
    }
  });

  return {
    actions,
    getState: () => state,
    saveState
  };
};

describe("chat-store actions", () => {
  it("creates a new conversation and initializes an empty message list", () => {
    const harness = createActionHarness();

    const conversationId = harness.actions.createConversation();

    expect(harness.getState().activeConversationId).toBe(conversationId);
    expect(harness.getState().messages).toEqual([]);
    expect(harness.getState().conversations[0]?.id).toBe(conversationId);
    expect(harness.saveState).toHaveBeenCalledWith(
      expect.objectContaining({
        activeConversationId: conversationId,
        messages: []
      })
    );
  });

  it("appends structured compile results when send succeeds", async () => {
    const harness = createActionHarness(
      {},
      {
        resolveCompileOptions: vi.fn(async () => ({
          runtimeTarget: "direct" as const,
          runtimeCapabilities: {
            supportsOfficialAuth: false,
            supportsVision: true,
            supportsAgentSteps: false,
            supportsServerMetrics: false,
            supportsRateLimitHeaders: false
          },
          retryAttempts: 0,
          extraHeaders: {}
        })),
        compile: vi.fn(async () => ({
          trace_id: "trace_send",
          batch: {
            version: "1.0",
            scene_id: "scene_send",
            transaction_id: "tx_send",
            commands: [],
            post_checks: ["待确认：点 D 在线段 BC 上"],
            explanations: ["已创建三角形 ABC"]
          },
          agent_steps: []
        })),
        execute: vi.fn(async () => undefined)
      }
    );

    await harness.actions.send("画一个三角形");

    const assistantMessage =
      [...harness.getState().messages]
        .reverse()
        .find((message) => message.role === "assistant") ?? undefined;

    expect(assistantMessage?.result).toMatchObject({
      status: "success",
      commandCount: 0,
      summaryItems: ["已创建三角形 ABC"]
    });
    expect(assistantMessage?.result?.uncertaintyItems[0]?.label).toBe(
      "点 D 在线段 BC 上"
    );
  });
});
