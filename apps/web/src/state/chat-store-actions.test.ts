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

const createActionHarness = (stateOverride: Partial<ChatStoreState> = {}) => {
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
    deps: createDeps()
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
});
