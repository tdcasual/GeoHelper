import { CommandBatch } from "@geohelper/protocol";
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";

import { executeBatch } from "../geogebra/command-executor";
import {
  AgentStep,
  ChatMode,
  compileChat,
  CompileResponse,
  GatewayApiError
} from "../services/api-client";
import {
  appendDebugEventIfEnabled,
  CompileRuntimeOptions,
  resolveCompileRuntimeOptions,
  settingsStore
} from "./settings-store";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  traceId?: string;
  agentSteps?: AgentStep[];
}

export interface ConversationThread {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

export interface ChatStoreState {
  mode: ChatMode;
  sessionToken: string | null;
  conversations: ConversationThread[];
  activeConversationId: string | null;
  messages: ChatMessage[];
  isSending: boolean;
  reauthRequired: boolean;
  setMode: (mode: ChatMode) => void;
  setSessionToken: (sessionToken: string | null) => void;
  createConversation: () => string;
  selectConversation: (conversationId: string) => void;
  acknowledgeReauth: () => void;
  send: (content: string) => Promise<void>;
}

export interface ChatStoreDeps {
  compile: (input: {
    message: string;
    mode: ChatMode;
    sessionToken: string | null;
    model?: string;
    byokEndpoint?: string;
    byokKey?: string;
    timeoutMs?: number;
    extraHeaders?: Record<string, string>;
  }) => Promise<CompileResponse>;
  execute: (batch: CommandBatch) => Promise<void>;
  resolveCompileOptions: (input: {
    conversationId: string;
    mode: ChatMode;
  }) => Promise<CompileRuntimeOptions>;
  logEvent: (event: { level: "info" | "error"; message: string }) => void;
}

interface PersistedChatSnapshot {
  mode: ChatMode;
  sessionToken: string | null;
  conversations: ConversationThread[];
  activeConversationId: string | null;
  messages: ChatMessage[];
  reauthRequired: boolean;
}

const defaultDeps: ChatStoreDeps = {
  compile: ({
    message,
    mode,
    sessionToken,
    model,
    byokEndpoint,
    byokKey,
    timeoutMs,
    extraHeaders
  }) =>
    compileChat({
      message,
      mode,
      model,
      byokEndpoint,
      byokKey,
      timeoutMs,
      extraHeaders,
      sessionToken: sessionToken ?? undefined
    }),
  execute: (batch) => executeBatch(batch),
  resolveCompileOptions: ({ conversationId, mode }) =>
    resolveCompileRuntimeOptions({
      conversationId,
      mode
    }),
  logEvent: (event) => appendDebugEventIfEnabled(event)
};

const makeId = (): string => `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
export const CHAT_STORE_KEY = "geohelper.chat.snapshot";

const buildConversationTitle = (content: string): string => {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "新会话";
  }

  return normalized.length > 20 ? `${normalized.slice(0, 20)}...` : normalized;
};

const createConversationThread = (title = "新会话"): ConversationThread => {
  const now = Date.now();
  return {
    id: `conv_${makeId()}`,
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

const moveConversationToTop = (
  conversations: ConversationThread[],
  updatedConversation: ConversationThread
): ConversationThread[] => [
  updatedConversation,
  ...conversations.filter((item) => item.id !== updatedConversation.id)
];

const canUseStorage = (): boolean =>
  typeof localStorage !== "undefined" &&
  typeof localStorage.getItem === "function" &&
  typeof localStorage.setItem === "function";

const loadSnapshot = (): PersistedChatSnapshot => {
  const defaultConversation = createConversationThread();

  if (!canUseStorage()) {
    return {
      mode: "byok",
      sessionToken: null,
      conversations: [defaultConversation],
      activeConversationId: defaultConversation.id,
      messages: defaultConversation.messages,
      reauthRequired: false
    };
  }

  try {
    const raw = localStorage.getItem(CHAT_STORE_KEY);
    if (!raw) {
      const fallbackConversation = createConversationThread();
      return {
        mode: "byok",
        sessionToken: null,
        conversations: [fallbackConversation],
        activeConversationId: fallbackConversation.id,
        messages: fallbackConversation.messages,
        reauthRequired: false
      };
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
              typeof item.createdAt === "number"
                ? item.createdAt
                : Date.now(),
            updatedAt:
              typeof item.updatedAt === "number"
                ? item.updatedAt
                : Date.now(),
            messages: Array.isArray(item.messages) ? item.messages : []
          }))
      : [];

    const conversations =
      parsedConversations.length > 0
        ? parsedConversations
        : Array.isArray(parsed.messages)
          ? [
              {
                ...createConversationThread(
                  buildConversationTitle(parsed.messages[0]?.content ?? "")
                ),
                messages: parsed.messages
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
    const fallbackConversation = createConversationThread();
    return {
      mode: "byok",
      sessionToken: null,
      conversations: [fallbackConversation],
      activeConversationId: fallbackConversation.id,
      messages: fallbackConversation.messages,
      reauthRequired: false
    };
  }
};

const persistSnapshot = (snapshot: PersistedChatSnapshot): void => {
  if (!canUseStorage()) {
    return;
  }

  localStorage.setItem(CHAT_STORE_KEY, JSON.stringify(snapshot));
};

export const createChatStore = (
  depsOverride: Partial<ChatStoreDeps> = {}
) => {
  const deps = {
    ...defaultDeps,
    ...depsOverride
  };

  const initial = loadSnapshot();

  return createStore<ChatStoreState>((set, get) => ({
    mode: initial.mode,
    sessionToken: initial.sessionToken,
    conversations: initial.conversations,
    activeConversationId: initial.activeConversationId,
    messages: initial.messages,
    isSending: false,
    reauthRequired: initial.reauthRequired,
    setMode: (mode) =>
      set((state) => {
        const next = {
          ...state,
          mode
        };
        persistSnapshot({
          mode: next.mode,
          sessionToken: next.sessionToken,
          conversations: next.conversations,
          activeConversationId: next.activeConversationId,
          messages: next.messages,
          reauthRequired: next.reauthRequired
        });
        return {
          mode
        };
      }),
    setSessionToken: (sessionToken) =>
      set((state) => {
        const next = {
          ...state,
          sessionToken
        };
        persistSnapshot({
          mode: next.mode,
          sessionToken: next.sessionToken,
          conversations: next.conversations,
          activeConversationId: next.activeConversationId,
          messages: next.messages,
          reauthRequired: next.reauthRequired
        });
        return {
          sessionToken,
          reauthRequired: false
        };
      }),
    createConversation: () => {
      const conversation = createConversationThread();
      set((state) => {
        const conversations = [conversation, ...state.conversations];
        const activeConversationId = conversation.id;
        const messages = conversation.messages;
        persistSnapshot({
          mode: state.mode,
          sessionToken: state.sessionToken,
          conversations,
          activeConversationId,
          messages,
          reauthRequired: state.reauthRequired
        });
        return {
          conversations,
          activeConversationId,
          messages
        };
      });

      return conversation.id;
    },
    selectConversation: (conversationId) =>
      set((state) => {
        const exists = state.conversations.some(
          (item) => item.id === conversationId
        );
        if (!exists) {
          return {};
        }

        const messages = getMessagesForConversation(
          state.conversations,
          conversationId
        );
        persistSnapshot({
          mode: state.mode,
          sessionToken: state.sessionToken,
          conversations: state.conversations,
          activeConversationId: conversationId,
          messages,
          reauthRequired: state.reauthRequired
        });
        return {
          activeConversationId: conversationId,
          messages
        };
      }),
    acknowledgeReauth: () =>
      set((state) => {
        const next = {
          ...state,
          reauthRequired: false
        };
        persistSnapshot({
          mode: next.mode,
          sessionToken: next.sessionToken,
          conversations: next.conversations,
          activeConversationId: next.activeConversationId,
          messages: next.messages,
          reauthRequired: next.reauthRequired
        });
        return {
          reauthRequired: false
        };
      }),
    send: async (content) => {
      const userMessage: ChatMessage = {
        id: makeId(),
        role: "user",
        content
      };

      let targetConversationId = "";
      set((state) => {
        const currentConversation =
          (state.activeConversationId
            ? state.conversations.find(
                (item) => item.id === state.activeConversationId
              )
            : undefined) ??
          state.conversations[0] ??
          createConversationThread();
        const activeConversationId = currentConversation.id;
        targetConversationId = currentConversation.id;

        const titled =
          currentConversation.messages.length === 0
            ? buildConversationTitle(content)
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
        const messages = getMessagesForConversation(
          conversations,
          state.activeConversationId ?? activeConversationId
        );

        persistSnapshot({
          mode: state.mode,
          sessionToken: state.sessionToken,
          conversations,
          activeConversationId:
            state.activeConversationId ?? activeConversationId,
          messages,
          reauthRequired: state.reauthRequired
        });
        return {
          conversations,
          activeConversationId:
            state.activeConversationId ?? activeConversationId,
          messages,
          isSending: true
        };
      });

      try {
        const runtime = await deps.resolveCompileOptions({
          conversationId: targetConversationId,
          mode: get().mode
        });

        if (
          get().mode === "byok" &&
          runtime.byokRuntimeIssue?.code === "BYOK_KEY_DECRYPT_FAILED"
        ) {
          const issue = runtime.byokRuntimeIssue;
          deps.logEvent({
            level: "error",
            message: `BYOK Key 恢复提示：${issue.presetName}`
          });
          settingsStore.getState().setDrawerOpen(true);
          const assistantMessage: ChatMessage = {
            id: makeId(),
            role: "assistant",
            content: `BYOK 密钥不可用（预设：${issue.presetName}）。请在设置中重新填写 API Key 后重试。`
          };
          set((state) => {
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
            const messages = getMessagesForConversation(
              conversations,
              state.activeConversationId
            );
            persistSnapshot({
              mode: state.mode,
              sessionToken: state.sessionToken,
              conversations,
              activeConversationId: state.activeConversationId,
              messages,
              reauthRequired: state.reauthRequired
            });
            return {
              conversations,
              messages,
              isSending: false
            };
          });
          return;
        }

        deps.logEvent({
          level: "info",
          message: `发送请求：mode=${get().mode} model=${runtime.model ?? "default"}`
        });

        let lastError: unknown;
        let compileResult:
          | {
              batch: CompileResponse["batch"];
              agentSteps: CompileResponse["agent_steps"];
              traceId: CompileResponse["trace_id"];
            }
          | undefined;

        for (let attempt = 0; attempt <= runtime.retryAttempts; attempt += 1) {
          try {
            const response = await deps.compile({
              message: content,
              mode: get().mode,
              sessionToken: get().sessionToken,
              model: runtime.model,
              byokEndpoint: runtime.byokEndpoint,
              byokKey: runtime.byokKey,
              timeoutMs: runtime.timeoutMs,
              extraHeaders: runtime.extraHeaders
            });
            compileResult = {
              batch: response.batch,
              agentSteps: response.agent_steps,
              traceId: response.trace_id
            };
            break;
          } catch (error) {
            lastError = error;
            const isSessionExpired =
              error instanceof GatewayApiError &&
              (error.code === "SESSION_EXPIRED" ||
                error.code === "MISSING_AUTH_HEADER") &&
              get().mode === "official";
            const shouldRetry =
              !isSessionExpired && attempt < runtime.retryAttempts;
            deps.logEvent({
              level: shouldRetry ? "info" : "error",
              message: shouldRetry
                ? `请求失败，准备重试 (${attempt + 1}/${runtime.retryAttempts})`
                : "请求失败，停止重试"
            });
            if (!shouldRetry) {
              throw error;
            }
          }
        }

        if (!compileResult) {
          throw lastError ?? new Error("Compile result is empty");
        }

        const { batch, agentSteps, traceId } = compileResult;
        await deps.execute(batch);

        const assistantMessage: ChatMessage = {
          id: makeId(),
          role: "assistant",
          content: `已生成 ${batch.commands.length} 条指令`,
          traceId,
          agentSteps: Array.isArray(agentSteps) ? agentSteps : []
        };
        set((state) => {
          const targetConversation = state.conversations.find(
            (item) => item.id === targetConversationId
          );
          if (!targetConversation) {
            return {
              isSending: false
            };
          }

          const updatedConversation: ConversationThread = {
            ...targetConversation,
            updatedAt: Date.now(),
            messages: [...targetConversation.messages, assistantMessage]
          };
          const conversations = moveConversationToTop(
            state.conversations,
            updatedConversation
          );
          const messages = getMessagesForConversation(
            conversations,
            state.activeConversationId
          );
          persistSnapshot({
            mode: state.mode,
            sessionToken: state.sessionToken,
            conversations,
            activeConversationId: state.activeConversationId,
            messages,
            reauthRequired: state.reauthRequired
          });
          return {
            conversations,
            messages,
            isSending: false
          };
        });
      } catch (error) {
        const isSessionExpired =
          error instanceof GatewayApiError &&
          (error.code === "SESSION_EXPIRED" ||
            error.code === "MISSING_AUTH_HEADER") &&
          get().mode === "official";

        const assistantMessage: ChatMessage = {
          id: makeId(),
          role: "assistant",
          content: isSessionExpired
            ? "官方会话已过期，请重新输入 Token"
            : "生成失败，请重试"
        };
        set((state) => {
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
          const messages = getMessagesForConversation(
            conversations,
            state.activeConversationId
          );
          const reauthRequired = isSessionExpired ? true : state.reauthRequired;
          const sessionToken = isSessionExpired ? null : state.sessionToken;
          persistSnapshot({
            mode: state.mode,
            sessionToken,
            conversations,
            activeConversationId: state.activeConversationId,
            messages,
            reauthRequired
          });
          return {
            conversations,
            messages,
            isSending: false,
            sessionToken,
            reauthRequired
          };
        });
      }
    }
  }));
};

export const chatStore = createChatStore();

export const useChatStore = <T>(selector: (state: ChatStoreState) => T): T =>
  useStore(chatStore, selector);
