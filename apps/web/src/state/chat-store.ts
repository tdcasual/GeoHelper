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

export const createChatStore = (
  depsOverride: Partial<ChatStoreDeps> = {}
) => {
  const deps = {
    ...defaultDeps,
    ...depsOverride
  };

  return createStore<ChatStoreState>((set, get) => ({
    mode: "byok",
    sessionToken: null,
    messages: [],
    isSending: false,
    setMode: (mode) => set({ mode }),
    setSessionToken: (sessionToken) => set({ sessionToken }),
    send: async (content) => {
      const userMessage: ChatMessage = {
        id: makeId(),
        role: "user",
        content
      };
      set((state) => ({
        messages: [...state.messages, userMessage],
        isSending: true
      }));

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
        set((state) => ({
          messages: [...state.messages, assistantMessage],
          isSending: false
        }));
      } catch {
        const assistantMessage: ChatMessage = {
          id: makeId(),
          role: "assistant",
          content: "生成失败，请重试"
        };
        set((state) => ({
          messages: [...state.messages, assistantMessage],
          isSending: false
        }));
      }
    }
  }));
};

export const chatStore = createChatStore();

export const useChatStore = <T>(selector: (state: ChatStoreState) => T): T =>
  useStore(chatStore, selector);
