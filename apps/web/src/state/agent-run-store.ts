import type { AgentRunEnvelope } from "@geohelper/protocol";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

export interface AgentRunStoreState {
  runsById: Record<string, AgentRunEnvelope>;
  messageRunIds: Record<string, string>;
  latestRunId: string | null;
  upsertRun: (run: AgentRunEnvelope) => void;
  linkMessageToRun: (messageId: string, runId: string) => void;
  getRunForMessage: (messageId: string) => AgentRunEnvelope | null;
  clear: () => void;
}

export const createAgentRunStore = () =>
  createStore<AgentRunStoreState>((set, get) => ({
    runsById: {},
    messageRunIds: {},
    latestRunId: null,
    upsertRun: (run) =>
      set((state) => ({
        runsById: {
          ...state.runsById,
          [run.run.id]: run
        },
        latestRunId: run.run.id
      })),
    linkMessageToRun: (messageId, runId) =>
      set((state) => ({
        messageRunIds: {
          ...state.messageRunIds,
          [messageId]: runId
        }
      })),
    getRunForMessage: (messageId) => {
      const runId = get().messageRunIds[messageId];
      return runId ? get().runsById[runId] ?? null : null;
    },
    clear: () => ({
      runsById: {},
      messageRunIds: {},
      latestRunId: null
    })
  }));

export const agentRunStore = createAgentRunStore();

export const getAgentRunForMessage = (
  messageId: string | null | undefined,
  store: ReturnType<typeof createAgentRunStore> = agentRunStore
): AgentRunEnvelope | null => {
  if (!messageId) {
    return null;
  }

  return store.getState().getRunForMessage(messageId);
};

export const useAgentRunStore = <T>(
  selector: (state: AgentRunStoreState) => T
): T => useStore(agentRunStore, selector);
