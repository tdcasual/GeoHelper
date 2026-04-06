import type { Artifact } from "@geohelper/agent-protocol";
import type { RunSnapshot } from "@geohelper/agent-store";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

export interface ArtifactStoreState {
  artifactsById: Record<string, Artifact>;
  artifactsByRunId: Record<string, Artifact[]>;
  applyRunSnapshot: (snapshot: RunSnapshot) => void;
  clear: () => void;
}

export const createArtifactStore = () =>
  createStore<ArtifactStoreState>((set) => ({
    artifactsById: {},
    artifactsByRunId: {},
    applyRunSnapshot: (snapshot) =>
      set((state) => ({
        artifactsById: snapshot.artifacts.reduce<Record<string, Artifact>>(
          (accumulator, artifact) => {
            accumulator[artifact.id] = artifact;
            return accumulator;
          },
          {
            ...state.artifactsById
          }
        ),
        artifactsByRunId: {
          ...state.artifactsByRunId,
          [snapshot.run.id]: snapshot.artifacts
        }
      })),
    clear: () => ({
      artifactsById: {},
      artifactsByRunId: {}
    })
  }));

export const artifactStore = createArtifactStore();

export const useArtifactStore = <T>(
  selector: (state: ArtifactStoreState) => T
): T => useStore(artifactStore, selector);
