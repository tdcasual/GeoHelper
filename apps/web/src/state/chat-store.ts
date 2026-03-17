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
import type { ChatStudioResult } from "./chat-result";
import { loadChatSnapshot, saveChatSnapshot } from "./chat-persistence";
import { createChatStoreActions } from "./chat-store-actions";
import { type PersistableChatState,toPersistedChatSnapshot } from "./chat-store-helpers";
import {
  appendDebugEventIfEnabled,
  CompileRuntimeOptions,
  resolveCompileRuntimeOptions
} from "./settings-store";

export type ChatAttachment = RuntimeAttachment;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: ChatAttachment[];
  result?: ChatStudioResult;
  traceId?: string;
  agentSteps?: AgentStep[];
}

export interface ChatSendInput {
  content: string;
  attachments?: ChatAttachment[];
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
    ...createChatStoreActions({
      set,
      get,
      saveState,
      deps
    })
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
