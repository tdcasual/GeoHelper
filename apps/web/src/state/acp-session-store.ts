import type { AcpSessionRecord } from "@geohelper/agent-store";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

const sortSessionsByCreatedAt = (
  sessions: AcpSessionRecord[]
): AcpSessionRecord[] =>
  [...sessions].sort((left, right) => left.createdAt.localeCompare(right.createdAt));

export interface AcpSessionStoreState {
  sessionsById: Record<string, AcpSessionRecord>;
  sessionsByRunId: Record<string, AcpSessionRecord[]>;
  applySessions: (sessions: AcpSessionRecord[]) => void;
  clear: () => void;
}

export const createAcpSessionStore = () =>
  createStore<AcpSessionStoreState>((set) => ({
    sessionsById: {},
    sessionsByRunId: {},
    applySessions: (sessions) =>
      set((state) => {
        if (sessions.length === 0) {
          return state;
        }

        const sessionsById = { ...state.sessionsById };
        const groupedByRunId = { ...state.sessionsByRunId };

        for (const session of sessions) {
          sessionsById[session.id] = session;
          const existingSessions = groupedByRunId[session.runId] ?? [];
          groupedByRunId[session.runId] = sortSessionsByCreatedAt([
            ...existingSessions.filter((item) => item.id !== session.id),
            session
          ]);
        }

        return {
          sessionsById,
          sessionsByRunId: groupedByRunId
        };
      }),
    clear: () => ({
      sessionsById: {},
      sessionsByRunId: {}
    })
  }));

export const acpSessionStore = createAcpSessionStore();

export const useAcpSessionStore = <T>(
  selector: (state: AcpSessionStoreState) => T
): T => useStore(acpSessionStore, selector);
