import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

export interface PlatformThread {
  id: string;
  title: string;
  createdAt: string;
}

export interface ThreadStoreState {
  threadsById: Record<string, PlatformThread>;
  threadIds: string[];
  currentThreadId: string | null;
  threadIdByConversationId: Record<string, string>;
  upsertThread: (thread: PlatformThread) => void;
  bindConversationThread: (
    conversationId: string,
    thread: PlatformThread
  ) => void;
  selectThread: (threadId: string) => void;
  clear: () => void;
}

export const createThreadStore = () =>
  createStore<ThreadStoreState>((set) => ({
    threadsById: {},
    threadIds: [],
    currentThreadId: null,
    threadIdByConversationId: {},
    upsertThread: (thread) =>
      set((state) => ({
        threadsById: {
          ...state.threadsById,
          [thread.id]: thread
        },
        threadIds: state.threadIds.includes(thread.id)
          ? state.threadIds
          : [...state.threadIds, thread.id],
        currentThreadId: thread.id
      })),
    bindConversationThread: (conversationId, thread) =>
      set((state) => ({
        threadsById: {
          ...state.threadsById,
          [thread.id]: thread
        },
        threadIds: state.threadIds.includes(thread.id)
          ? state.threadIds
          : [...state.threadIds, thread.id],
        currentThreadId: thread.id,
        threadIdByConversationId: {
          ...state.threadIdByConversationId,
          [conversationId]: thread.id
        }
      })),
    selectThread: (threadId) => ({
      currentThreadId: threadId
    }),
    clear: () => ({
      threadsById: {},
      threadIds: [],
      currentThreadId: null,
      threadIdByConversationId: {}
    })
  }));

export const threadStore = createThreadStore();

export const useThreadStore = <T>(
  selector: (state: ThreadStoreState) => T
): T => useStore(threadStore, selector);
