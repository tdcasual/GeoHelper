import { asObject } from "./backup-snapshot";

type ConversationRecord = Record<string, unknown> & {
  id: string;
  updatedAt: number;
};

const toConversationList = (value: unknown): ConversationRecord[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => asObject(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => ({
      ...item,
      id: String(item.id ?? ""),
      updatedAt:
        typeof item.updatedAt === "number"
          ? item.updatedAt
          : typeof item.createdAt === "number"
            ? item.createdAt
            : Date.now(),
      createdAt:
        typeof item.createdAt === "number"
          ? item.createdAt
          : typeof item.updatedAt === "number"
            ? item.updatedAt
            : Date.now(),
      title:
        typeof item.title === "string" && item.title.trim()
          ? item.title
          : "新会话",
      messages: Array.isArray(item.messages) ? item.messages : []
    }))
    .filter((item) => item.id.length > 0);
};

const mergeByIdAndUpdatedAt = (
  current: ConversationRecord[],
  incoming: ConversationRecord[]
): ConversationRecord[] => {
  const merged = new Map<string, ConversationRecord>();

  for (const item of current) {
    merged.set(item.id, item);
  }

  for (const item of incoming) {
    const existing = merged.get(item.id);
    if (!existing || item.updatedAt >= existing.updatedAt) {
      merged.set(item.id, item);
    }
  }

  return Array.from(merged.values()).sort((a, b) => b.updatedAt - a.updatedAt);
};

export const buildChatSnapshot = (value: unknown): Record<string, unknown> | null => {
  const source = asObject(value);
  if (!source) {
    return null;
  }

  const conversations = toConversationList(source.conversations);
  const activeConversationId =
    typeof source.activeConversationId === "string" &&
    conversations.some((item) => item.id === source.activeConversationId)
      ? source.activeConversationId
      : conversations[0]?.id ?? null;
  const activeMessages = activeConversationId
    ? (conversations.find((item) => item.id === activeConversationId)?.messages ??
      [])
    : [];

  return {
    mode: source.mode ?? "byok",
    sessionToken:
      typeof source.sessionToken === "string" ? source.sessionToken : null,
    conversations,
    activeConversationId,
    messages: Array.isArray(activeMessages) ? activeMessages : [],
    reauthRequired: Boolean(source.reauthRequired)
  };
};

export const mergeChatSnapshot = (
  currentRaw: unknown,
  incomingRaw: unknown
): Record<string, unknown> | null => {
  const current = buildChatSnapshot(currentRaw);
  const incoming = buildChatSnapshot(incomingRaw);

  if (!current && !incoming) {
    return null;
  }
  if (!current) {
    return incoming;
  }
  if (!incoming) {
    return current;
  }

  const mergedConversations = mergeByIdAndUpdatedAt(
    toConversationList(current.conversations),
    toConversationList(incoming.conversations)
  );
  const currentActive =
    typeof current.activeConversationId === "string"
      ? current.activeConversationId
      : undefined;
  const incomingActive =
    typeof incoming.activeConversationId === "string"
      ? incoming.activeConversationId
      : undefined;
  const activeConversationId = [currentActive, incomingActive].find(
    (candidate) =>
      candidate && mergedConversations.some((item) => item.id === candidate)
  );
  const activeMessages = activeConversationId
    ? (mergedConversations.find((item) => item.id === activeConversationId)
        ?.messages ?? [])
    : [];

  return {
    mode: current.mode ?? incoming.mode ?? "byok",
    sessionToken: current.sessionToken ?? incoming.sessionToken ?? null,
    conversations: mergedConversations,
    activeConversationId: activeConversationId ?? mergedConversations[0]?.id ?? null,
    messages: Array.isArray(activeMessages) ? activeMessages : [],
    reauthRequired: Boolean(current.reauthRequired ?? incoming.reauthRequired)
  };
};
