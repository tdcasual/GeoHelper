import { CommandBatch } from "@geohelper/protocol";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

import { executeBatch } from "../geogebra/command-executor";
import { compileWithRuntime } from "../runtime/runtime-service";
import {
  AgentStep,
  ChatMode,
  RuntimeAttachment,
  RuntimeCompileResponse,
  RuntimeTarget
} from "../runtime/types";
import { ensureRemoteSyncStartupCheck } from "../storage/remote-sync";
import type { PersistedChatSnapshot } from "./chat-persistence";
import {
  loadChatSnapshot,
  saveChatSnapshot
} from "./chat-persistence";
import {
  buildAssistantMessageFromCompileResult,
  buildAssistantMessageFromError,
  buildAssistantMessageFromGuard,
  buildCompileContext,
  isOfficialSessionExpiredError,
  resolveChatSendGuard
} from "./chat-send-flow";
import { sceneStore } from "./scene-store";
import {
  appendDebugEventIfEnabled,
  CompileRuntimeOptions,
  resolveCompileRuntimeOptions,
  settingsStore
} from "./settings-store";

export type ChatAttachment = RuntimeAttachment;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: ChatAttachment[];
  traceId?: string;
  agentSteps?: AgentStep[];
}

export interface ChatSendInput {
  content: string;
  attachments?: ChatAttachment[];
}

interface NormalizedChatSendInput {
  content: string;
  attachments: ChatAttachment[];
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
  send: (input: string | ChatSendInput) => Promise<void>;
  sendFollowUpPrompt: (prompt: string) => Promise<void>;
}

export interface ChatStoreDeps {
  compile: (input: {
    message: string;
    attachments?: ChatAttachment[];
    mode: ChatMode;
    runtimeTarget?: RuntimeTarget;
    runtimeBaseUrl?: string;
    sessionToken: string | null;
    model?: string;
    byokEndpoint?: string;
    byokKey?: string;
    timeoutMs?: number;
    extraHeaders?: Record<string, string>;
    context?: {
      recentMessages?: Array<{
        role: "user" | "assistant";
        content: string;
      }>;
      sceneTransactions?: Array<{
        sceneId: string;
        transactionId: string;
        commandCount: number;
      }>;
    };
  }) => Promise<RuntimeCompileResponse>;
  execute: (batch: CommandBatch) => Promise<void>;
  resolveCompileOptions: (input: {
    conversationId: string;
    mode: ChatMode;
  }) => Promise<CompileRuntimeOptions>;
  logEvent: (event: { level: "info" | "error"; message: string }) => void;
}

const defaultDeps: ChatStoreDeps = {
  compile: ({
    message,
    mode,
    runtimeTarget,
    runtimeBaseUrl,
    sessionToken,
    model,
    byokEndpoint,
    byokKey,
    timeoutMs,
    extraHeaders,
    attachments,
    context
  }) =>
    compileWithRuntime({
      target: runtimeTarget ?? "gateway",
      baseUrl: runtimeBaseUrl,
      message,
      mode,
      model,
      byokEndpoint,
      byokKey,
      timeoutMs,
      extraHeaders,
      attachments,
      context,
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

const buildConversationTitle = (input: ChatSendInput | string): string => {
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

const normalizeSendInput = (
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

type PersistableChatState = Pick<
  ChatStoreState,
  | "mode"
  | "sessionToken"
  | "conversations"
  | "activeConversationId"
  | "messages"
  | "reauthRequired"
>;

const toPersistedChatSnapshot = (
  state: PersistableChatState
): PersistedChatSnapshot => ({
  mode: state.mode,
  sessionToken: state.sessionToken,
  conversations: state.conversations,
  activeConversationId: state.activeConversationId,
  messages: state.messages,
  reauthRequired: state.reauthRequired
});

const buildStateWithAssistantMessage = (
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

export const createChatStore = (
  depsOverride: Partial<ChatStoreDeps> = {}
) => {
  const deps = {
    ...defaultDeps,
    ...depsOverride
  };

  const initial = loadChatSnapshot();
  const saveState = (state: PersistableChatState): void => {
    saveChatSnapshot(toPersistedChatSnapshot(state));
  };

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
        saveState(next);
        return {
          mode
        };
      }),
    setSessionToken: (sessionToken) =>
      set((state) => {
        const next = {
          ...state,
          sessionToken,
          reauthRequired: false
        };
        saveState(next);
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
        saveState({
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
        saveState({
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
        saveState(next);
        return {
          reauthRequired: false
        };
      }),
    sendFollowUpPrompt: async (prompt) => {
      const normalizedPrompt = prompt.trim();
      if (!normalizedPrompt) {
        return;
      }

      await get().send(normalizedPrompt);
    },
    send: async (input) => {
      const normalizedInput = normalizeSendInput(input);
      const userMessage: ChatMessage = {
        id: makeId(),
        role: "user",
        content: normalizedInput.content,
        attachments:
          normalizedInput.attachments.length > 0
            ? normalizedInput.attachments
            : undefined
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
        const messages = getMessagesForConversation(
          conversations,
          state.activeConversationId ?? activeConversationId
        );

        saveState({
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
        const guard = resolveChatSendGuard({
          mode: get().mode,
          runtime,
          attachments: normalizedInput.attachments
        });
        if (guard) {
          if ("logEvent" in guard) {
            deps.logEvent(guard.logEvent);
          }
          if ("openSettings" in guard && guard.openSettings) {
            settingsStore.getState().setDrawerOpen(true);
          }

          const assistantMessage = buildAssistantMessageFromGuard({
            id: makeId(),
            guard
          });
          set((state) => {
            const next = buildStateWithAssistantMessage(
              state,
              targetConversationId,
              assistantMessage
            );
            saveState(next);
            return {
              conversations: next.conversations,
              messages: next.messages,
              isSending: false
            };
          });
          return;
        }

        deps.logEvent({
          level: "info",
          message: `发送请求：target=${runtime.runtimeTarget} mode=${get().mode} model=${runtime.model ?? "default"}`
        });

        let lastError: unknown;
        let compileResult:
          | {
              batch: RuntimeCompileResponse["batch"];
              agentSteps: RuntimeCompileResponse["agent_steps"];
              traceId: RuntimeCompileResponse["trace_id"];
            }
          | undefined;

        for (let attempt = 0; attempt <= runtime.retryAttempts; attempt += 1) {
          try {
            const targetConversation = get().conversations.find(
              (item) => item.id === targetConversationId
            );
            const context = buildCompileContext({
              conversation: targetConversation,
              sceneTransactions: sceneStore.getState().transactions
            });
            const response = await deps.compile({
              message: normalizedInput.content,
              attachments: normalizedInput.attachments,
              mode: get().mode,
              runtimeTarget: runtime.runtimeTarget,
              runtimeBaseUrl: runtime.runtimeBaseUrl,
              sessionToken: get().sessionToken,
              model: runtime.model,
              byokEndpoint: runtime.byokEndpoint,
              byokKey: runtime.byokKey,
              timeoutMs: runtime.timeoutMs,
              extraHeaders: runtime.extraHeaders,
              context
            });
            compileResult = {
              batch: response.batch,
              agentSteps: response.agent_steps,
              traceId: response.trace_id
            };
            break;
          } catch (error) {
            lastError = error;
            const isSessionExpired = isOfficialSessionExpiredError(
              error,
              get().mode
            );
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
        sceneStore.getState().recordTransaction(batch);

        const assistantMessage = buildAssistantMessageFromCompileResult({
          id: makeId(),
          batch,
          traceId,
          agentSteps
        });
        set((state) => {
          const next = buildStateWithAssistantMessage(
            state,
            targetConversationId,
            assistantMessage
          );
          saveState(next);
          return {
            conversations: next.conversations,
            messages: next.messages,
            isSending: false
          };
        });
      } catch (error) {
        const isSessionExpired = isOfficialSessionExpiredError(error, get().mode);
        const assistantMessage = buildAssistantMessageFromError({
          id: makeId(),
          error,
          mode: get().mode
        });
        set((state) => {
          const next = buildStateWithAssistantMessage(
            state,
            targetConversationId,
            assistantMessage,
            {
              sessionToken: isSessionExpired ? null : state.sessionToken,
              reauthRequired: isSessionExpired ? true : state.reauthRequired
            }
          );
          saveState(next);
          return {
            conversations: next.conversations,
            messages: next.messages,
            isSending: false,
            sessionToken: next.sessionToken,
            reauthRequired: next.reauthRequired
          };
        });
      }
    }
  }));
};

export const chatStore = createChatStore();

void Promise.resolve().then(() => ensureRemoteSyncStartupCheck());

const applyChatSnapshotToStore = (
  store: ReturnType<typeof createChatStore>,
  snapshot: PersistedChatSnapshot
): PersistedChatSnapshot => {
  store.setState((state) => ({
    mode: snapshot.mode,
    sessionToken: snapshot.sessionToken,
    conversations: snapshot.conversations,
    activeConversationId: snapshot.activeConversationId,
    messages: snapshot.messages,
    reauthRequired: snapshot.reauthRequired,
    isSending: state.isSending
  }));
  return snapshot;
};

export const syncChatStoreFromStorage = (
  store: ReturnType<typeof createChatStore> = chatStore
): PersistedChatSnapshot => applyChatSnapshotToStore(store, loadChatSnapshot());

export const useChatStore = <T>(selector: (state: ChatStoreState) => T): T =>
  useStore(chatStore, selector);

export { CHAT_STORE_KEY } from "./chat-persistence";
