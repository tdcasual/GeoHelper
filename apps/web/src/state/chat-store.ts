import { CommandBatch } from "@geohelper/protocol";
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";

import { executeBatch } from "../geogebra/command-executor";
import {
  ChatMode,
  compileChat,
  CompileResponse
} from "../services/api-client";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface ChatStoreState {
  mode: ChatMode;
  sessionToken: string | null;
  messages: ChatMessage[];
  isSending: boolean;
  setMode: (mode: ChatMode) => void;
  setSessionToken: (sessionToken: string | null) => void;
  send: (content: string) => Promise<void>;
}

export interface ChatStoreDeps {
  compile: (input: {
    message: string;
    mode: ChatMode;
    sessionToken: string | null;
  }) => Promise<CompileResponse>;
  execute: (batch: CommandBatch) => Promise<void>;
}

interface PersistedChatSnapshot {
  mode: ChatMode;
  sessionToken: string | null;
  messages: ChatMessage[];
}

const defaultDeps: ChatStoreDeps = {
  compile: ({ message, mode, sessionToken }) =>
    compileChat({
      message,
      mode,
      sessionToken: sessionToken ?? undefined
    }),
  execute: (batch) => executeBatch(batch)
};

const makeId = (): string => `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
const CHAT_STORE_KEY = "geohelper.chat.snapshot";
const canUseStorage = (): boolean =>
  typeof localStorage !== "undefined" &&
  typeof localStorage.getItem === "function" &&
  typeof localStorage.setItem === "function";

const loadSnapshot = (): PersistedChatSnapshot => {
  if (!canUseStorage()) {
    return {
      mode: "byok",
      sessionToken: null,
      messages: []
    };
  }

  try {
    const raw = localStorage.getItem(CHAT_STORE_KEY);
    if (!raw) {
      return {
        mode: "byok",
        sessionToken: null,
        messages: []
      };
    }

    const parsed = JSON.parse(raw) as PersistedChatSnapshot;
    return {
      mode: parsed.mode ?? "byok",
      sessionToken: parsed.sessionToken ?? null,
      messages: Array.isArray(parsed.messages) ? parsed.messages : []
    };
  } catch {
    return {
      mode: "byok",
      sessionToken: null,
      messages: []
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
    messages: initial.messages,
    isSending: false,
    setMode: (mode) =>
      set((state) => {
        const next = {
          ...state,
          mode
        };
        persistSnapshot({
          mode: next.mode,
          sessionToken: next.sessionToken,
          messages: next.messages
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
          messages: next.messages
        });
        return {
          sessionToken
        };
      }),
    send: async (content) => {
      const userMessage: ChatMessage = {
        id: makeId(),
        role: "user",
        content
      };
      set((state) => {
        const messages = [...state.messages, userMessage];
        persistSnapshot({
          mode: state.mode,
          sessionToken: state.sessionToken,
          messages
        });
        return {
          messages,
          isSending: true
        };
      });

      try {
        const { batch } = await deps.compile({
          message: content,
          mode: get().mode,
          sessionToken: get().sessionToken
        });
        await deps.execute(batch);

        const assistantMessage: ChatMessage = {
          id: makeId(),
          role: "assistant",
          content: `已生成 ${batch.commands.length} 条指令`
        };
        set((state) => {
          const messages = [...state.messages, assistantMessage];
          persistSnapshot({
            mode: state.mode,
            sessionToken: state.sessionToken,
            messages
          });
          return {
            messages,
            isSending: false
          };
        });
      } catch {
        const assistantMessage: ChatMessage = {
          id: makeId(),
          role: "assistant",
          content: "生成失败，请重试"
        };
        set((state) => {
          const messages = [...state.messages, assistantMessage];
          persistSnapshot({
            mode: state.mode,
            sessionToken: state.sessionToken,
            messages
          });
          return {
            messages,
            isSending: false
          };
        });
      }
    }
  }));
};

export const chatStore = createChatStore();

export const useChatStore = <T>(selector: (state: ChatStoreState) => T): T =>
  useStore(chatStore, selector);
