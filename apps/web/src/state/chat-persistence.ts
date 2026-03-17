import type { ChatMode } from "../runtime/types";
import { persistChatSnapshotToIndexedDb } from "../storage/indexed-sync";
import { notifyRemoteSyncLocalMutation } from "../storage/remote-sync";
import { normalizeChatStudioResult } from "./chat-result";
import type { ChatMessage, ConversationThread } from "./chat-store";

export interface PersistedChatSnapshot {
  mode: ChatMode;
  sessionToken: string | null;
  conversations: ConversationThread[];
  activeConversationId: string | null;
  messages: ChatMessage[];
  reauthRequired: boolean;
}

export const CHAT_STORE_KEY = "geohelper.chat.snapshot";

const createId = (): string =>
  `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

const canUseStorage = (): boolean =>
  typeof localStorage !== "undefined" &&
  typeof localStorage.getItem === "function" &&
  typeof localStorage.setItem === "function";

const createConversationThread = (title = "新会话"): ConversationThread => {
  const now = Date.now();
  return {
    id: `conv_${createId()}`,
    title,
    createdAt: now,
    updatedAt: now,
    messages: []
  };
};

const getMessagesForConversation = (
  conversations: ConversationThread[],
  conversationId: string | null
): ChatMessage[] => {
  const active =
    (conversationId
      ? conversations.find((item) => item.id === conversationId)
      : undefined) ?? conversations[0];
  return active?.messages ?? [];
};

const buildFallbackTitle = (content?: string): string => {
  const normalized = (content ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "新会话";
  }

  return normalized.length > 20 ? `${normalized.slice(0, 20)}...` : normalized;
};

const buildDefaultSnapshot = (): PersistedChatSnapshot => {
  const conversation = createConversationThread();
  return {
    mode: "byok",
    sessionToken: null,
    conversations: [conversation],
    activeConversationId: conversation.id,
    messages: conversation.messages,
    reauthRequired: false
  };
};

const normalizeMessage = (message: ChatMessage): ChatMessage => ({
  ...message,
  attachments: Array.isArray(message.attachments)
    ? message.attachments
    : undefined,
  result: normalizeChatStudioResult(message.result)
});

export const loadChatSnapshot = (): PersistedChatSnapshot => {
  if (!canUseStorage()) {
    return buildDefaultSnapshot();
  }

  try {
    const raw = localStorage.getItem(CHAT_STORE_KEY);
    if (!raw) {
      return buildDefaultSnapshot();
    }

    const parsed = JSON.parse(raw) as Partial<PersistedChatSnapshot> & {
      conversations?: Array<Partial<ConversationThread>>;
      messages?: ChatMessage[];
    };

    const parsedConversations = Array.isArray(parsed.conversations)
      ? parsed.conversations
          .filter((item) => item && typeof item.id === "string")
          .map((item) => ({
            id: String(item.id),
            title:
              typeof item.title === "string" && item.title.trim()
                ? item.title
                : "新会话",
            createdAt:
              typeof item.createdAt === "number" ? item.createdAt : Date.now(),
            updatedAt:
              typeof item.updatedAt === "number" ? item.updatedAt : Date.now(),
            messages: Array.isArray(item.messages)
              ? item.messages.map(normalizeMessage)
              : []
          }))
      : [];

    const conversations =
      parsedConversations.length > 0
        ? parsedConversations
        : Array.isArray(parsed.messages)
          ? [
              {
                ...createConversationThread(
                  buildFallbackTitle(parsed.messages[0]?.content)
                ),
                messages: parsed.messages.map(normalizeMessage)
              }
            ]
          : [createConversationThread()];

    const activeConversationId =
      typeof parsed.activeConversationId === "string" &&
      conversations.some((item) => item.id === parsed.activeConversationId)
        ? parsed.activeConversationId
        : conversations[0]?.id ?? null;

    return {
      mode: parsed.mode ?? "byok",
      sessionToken: parsed.sessionToken ?? null,
      conversations,
      activeConversationId,
      messages: getMessagesForConversation(conversations, activeConversationId),
      reauthRequired: Boolean(parsed.reauthRequired)
    };
  } catch {
    return buildDefaultSnapshot();
  }
};

export const saveChatSnapshot = (snapshot: PersistedChatSnapshot): void => {
  if (!canUseStorage()) {
    return;
  }

  localStorage.setItem(CHAT_STORE_KEY, JSON.stringify(snapshot));
  void persistChatSnapshotToIndexedDb(snapshot as unknown as Record<string, unknown>);
  notifyRemoteSyncLocalMutation();
};
