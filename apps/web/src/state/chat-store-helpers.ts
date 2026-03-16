import type { PersistedChatSnapshot } from "./chat-persistence";
import type {
  ChatAttachment,
  ChatMessage,
  ChatSendInput,
  ChatStoreState,
  ConversationThread
} from "./chat-store";

export interface NormalizedChatSendInput {
  content: string;
  attachments: ChatAttachment[];
}

export type PersistableChatState = Pick<
  ChatStoreState,
  | "mode"
  | "sessionToken"
  | "conversations"
  | "activeConversationId"
  | "messages"
  | "reauthRequired"
>;

export const makeId = (): string =>
  `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

export const buildConversationTitle = (
  input: ChatSendInput | NormalizedChatSendInput | string
): string => {
  const content = typeof input === "string" ? input : input.content;
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized) {
    return normalized.length > 20 ? `${normalized.slice(0, 20)}...` : normalized;
  }

  const attachmentCount =
    typeof input === "string" ? 0 : input.attachments?.length ?? 0;
  if (attachmentCount > 0) {
    return attachmentCount > 1 ? `图片消息 (${attachmentCount})` : "图片消息";
  }

  return "新会话";
};

export const createConversationThread = (
  title = "新会话"
): ConversationThread => {
  const now = Date.now();
  return {
    id: `conv_${makeId()}`,
    title,
    createdAt: now,
    updatedAt: now,
    messages: []
  };
};

export const getMessagesForConversation = (
  conversations: ConversationThread[],
  conversationId: string | null
): ChatMessage[] => {
  const active =
    (conversationId
      ? conversations.find((item) => item.id === conversationId)
      : undefined) ?? conversations[0];

  return active?.messages ?? [];
};

export const moveConversationToTop = (
  conversations: ConversationThread[],
  updatedConversation: ConversationThread
): ConversationThread[] => [
  updatedConversation,
  ...conversations.filter((item) => item.id !== updatedConversation.id)
];

export const normalizeSendInput = (
  input: string | ChatSendInput
): NormalizedChatSendInput => {
  if (typeof input === "string") {
    return {
      content: input,
      attachments: []
    };
  }

  return {
    content: input.content,
    attachments: Array.isArray(input.attachments) ? input.attachments : []
  };
};

export const toPersistedChatSnapshot = (
  state: PersistableChatState
): PersistedChatSnapshot => ({
  mode: state.mode,
  sessionToken: state.sessionToken,
  conversations: state.conversations,
  activeConversationId: state.activeConversationId,
  messages: state.messages,
  reauthRequired: state.reauthRequired
});

export const buildStateWithAssistantMessage = (
  state: PersistableChatState,
  targetConversationId: string,
  assistantMessage: ChatMessage,
  overrides: Partial<
    Pick<PersistableChatState, "sessionToken" | "reauthRequired">
  > = {}
): PersistableChatState => {
  const targetConversation = state.conversations.find(
    (item) => item.id === targetConversationId
  );
  const updatedConversation = targetConversation
    ? {
        ...targetConversation,
        updatedAt: Date.now(),
        messages: [...targetConversation.messages, assistantMessage]
      }
    : undefined;
  const conversations = updatedConversation
    ? moveConversationToTop(state.conversations, updatedConversation)
    : state.conversations;

  return {
    ...state,
    conversations,
    messages: getMessagesForConversation(conversations, state.activeConversationId),
    sessionToken:
      overrides.sessionToken !== undefined
        ? overrides.sessionToken
        : state.sessionToken,
    reauthRequired:
      overrides.reauthRequired !== undefined
        ? overrides.reauthRequired
        : state.reauthRequired
  };
};

export const buildStateWithUserMessage = (params: {
  state: PersistableChatState;
  normalizedInput: NormalizedChatSendInput;
  userMessage: ChatMessage;
}): {
  targetConversationId: string;
  next: PersistableChatState;
} => {
  const { normalizedInput, state, userMessage } = params;
  const currentConversation =
    (state.activeConversationId
      ? state.conversations.find((item) => item.id === state.activeConversationId)
      : undefined) ??
    state.conversations[0] ??
    createConversationThread();
  const activeConversationId = currentConversation.id;
  const titled =
    currentConversation.messages.length === 0
      ? buildConversationTitle(normalizedInput)
      : currentConversation.title;
  const updatedConversation: ConversationThread = {
    ...currentConversation,
    title: titled,
    updatedAt: Date.now(),
    messages: [...currentConversation.messages, userMessage]
  };
  const baseConversations = state.conversations.some(
    (item) => item.id === currentConversation.id
  )
    ? state.conversations
    : [currentConversation, ...state.conversations];
  const conversations = moveConversationToTop(
    baseConversations,
    updatedConversation
  );
  const resolvedActiveConversationId =
    state.activeConversationId ?? activeConversationId;

  return {
    targetConversationId: currentConversation.id,
    next: {
      ...state,
      conversations,
      activeConversationId: resolvedActiveConversationId,
      messages: getMessagesForConversation(
        conversations,
        resolvedActiveConversationId
      )
    }
  };
};
