import type { Run, RunEvent } from "@geohelper/agent-protocol";
import type { RunSnapshot } from "@geohelper/agent-store";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

const mergeRunsById = (
  existingRuns: Record<string, Run>,
  runs: Run[]
): Record<string, Run> => {
  if (runs.length === 0) {
    return existingRuns;
  }

  return runs.reduce<Record<string, Run>>(
    (runsById, run) => ({
      ...runsById,
      [run.id]: run
    }),
    existingRuns
  );
};

const sortRunsByCreatedAt = (runs: Run[]): Run[] =>
  [...runs].sort((left, right) => left.createdAt.localeCompare(right.createdAt));

const upsertChildRun = (
  childRunsByParentRunId: Record<string, Run[]>,
  run: Run
): Record<string, Run[]> => {
  if (!run.parentRunId) {
    return childRunsByParentRunId;
  }

  const existingRuns = childRunsByParentRunId[run.parentRunId] ?? [];
  const nextRuns = sortRunsByCreatedAt([
    ...existingRuns.filter((childRun) => childRun.id !== run.id),
    run
  ]);

  return {
    ...childRunsByParentRunId,
    [run.parentRunId]: nextRuns
  };
};

export interface RunStoreState {
  runsById: Record<string, Run>;
  eventsByRunId: Record<string, RunEvent[]>;
  childRunsByParentRunId: Record<string, Run[]>;
  latestRunId: string | null;
  upsertRun: (run: Run) => void;
  applyStreamSnapshot: (snapshot: RunSnapshot) => void;
  clear: () => void;
}

export const createRunStore = () =>
  createStore<RunStoreState>((set) => ({
    runsById: {},
    eventsByRunId: {},
    childRunsByParentRunId: {},
    latestRunId: null,
    upsertRun: (run) =>
      set((state) => {
        const childRunsByParentRunId = upsertChildRun(
          state.childRunsByParentRunId,
          run
        );

        return {
          runsById: {
            ...state.runsById,
            [run.id]: run
          },
          childRunsByParentRunId,
          latestRunId: run.id
        };
      }),
    applyStreamSnapshot: (snapshot) =>
      set((state) => {
        const runs = [snapshot.run, ...snapshot.childRuns];
        const nextChildRunsByParentRunId = upsertChildRun(
          {
            ...state.childRunsByParentRunId,
            [snapshot.run.id]: sortRunsByCreatedAt(snapshot.childRuns)
          },
          snapshot.run
        );

        return {
          runsById: mergeRunsById(state.runsById, runs),
          eventsByRunId: {
            ...state.eventsByRunId,
            [snapshot.run.id]: snapshot.events
          },
          childRunsByParentRunId: nextChildRunsByParentRunId,
          latestRunId: snapshot.run.id
        };
      }),
    clear: () => ({
      runsById: {},
      eventsByRunId: {},
      childRunsByParentRunId: {},
      latestRunId: null
    })
  }));

export const runStore = createRunStore();

export const useRunStore = <T>(
  selector: (state: RunStoreState) => T
): T => useStore(runStore, selector);
