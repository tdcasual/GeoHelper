import type { Run, RunEvent } from "@geohelper/agent-protocol";
import type { RunSnapshot } from "@geohelper/agent-store";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

export interface RunStoreState {
  runsById: Record<string, Run>;
  eventsByRunId: Record<string, RunEvent[]>;
  latestRunId: string | null;
  upsertRun: (run: Run) => void;
  applyStreamSnapshot: (snapshot: RunSnapshot) => void;
  clear: () => void;
}

export const createRunStore = () =>
  createStore<RunStoreState>((set) => ({
    runsById: {},
    eventsByRunId: {},
    latestRunId: null,
    upsertRun: (run) =>
      set((state) => ({
        runsById: {
          ...state.runsById,
          [run.id]: run
        },
        latestRunId: run.id
      })),
    applyStreamSnapshot: (snapshot) =>
      set((state) => ({
        runsById: {
          ...state.runsById,
          [snapshot.run.id]: snapshot.run
        },
        eventsByRunId: {
          ...state.eventsByRunId,
          [snapshot.run.id]: snapshot.events
        },
        latestRunId: snapshot.run.id
      })),
    clear: () => ({
      runsById: {},
      eventsByRunId: {},
      latestRunId: null
    })
  }));

export const runStore = createRunStore();

export const useRunStore = <T>(
  selector: (state: RunStoreState) => T
): T => useStore(runStore, selector);
