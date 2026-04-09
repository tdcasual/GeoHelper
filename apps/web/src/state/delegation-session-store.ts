import type { DelegationSessionRecord } from "@geohelper/agent-store";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

const sortSessionsByCreatedAt = (
  sessions: DelegationSessionRecord[]
): DelegationSessionRecord[] =>
  [...sessions].sort((left, right) => left.createdAt.localeCompare(right.createdAt));

export interface DelegationSessionStoreState {
  sessionsById: Record<string, DelegationSessionRecord>;
  sessionsByRunId: Record<string, DelegationSessionRecord[]>;
  applySessions: (sessions: DelegationSessionRecord[]) => void;
  clear: () => void;
}

export const createDelegationSessionStore = () =>
  createStore<DelegationSessionStoreState>((set) => ({
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

export const delegationSessionStore = createDelegationSessionStore();

export const useDelegationSessionStore = <T>(
  selector: (state: DelegationSessionStoreState) => T
): T => useStore(delegationSessionStore, selector);
