import type { Checkpoint } from "@geohelper/agent-protocol";
import type { RunSnapshot } from "@geohelper/agent-store";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

export interface CheckpointStoreState {
  checkpointsById: Record<string, Checkpoint>;
  checkpointsByRunId: Record<string, Checkpoint[]>;
  applyRunSnapshot: (snapshot: RunSnapshot) => void;
  clear: () => void;
}

export const createCheckpointStore = () =>
  createStore<CheckpointStoreState>((set) => ({
    checkpointsById: {},
    checkpointsByRunId: {},
    applyRunSnapshot: (snapshot) =>
      set((state) => ({
        checkpointsById: snapshot.checkpoints.reduce<Record<string, Checkpoint>>(
          (accumulator, checkpoint) => {
            accumulator[checkpoint.id] = checkpoint;
            return accumulator;
          },
          {
            ...state.checkpointsById
          }
        ),
        checkpointsByRunId: {
          ...state.checkpointsByRunId,
          [snapshot.run.id]: snapshot.checkpoints
        }
      })),
    clear: () => ({
      checkpointsById: {},
      checkpointsByRunId: {}
    })
  }));

export const checkpointStore = createCheckpointStore();

export const useCheckpointStore = <T>(
  selector: (state: CheckpointStoreState) => T
): T => useStore(checkpointStore, selector);
