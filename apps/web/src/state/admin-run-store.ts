import type { Run } from "@geohelper/agent-protocol";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

import type { ControlPlaneClient } from "../runtime/control-plane-client";
import type { AdminRunTimeline } from "../runtime/types";

const sortRunsByCreatedAt = (runs: Run[]): Run[] =>
  [...runs].sort((left, right) => left.createdAt.localeCompare(right.createdAt));

export interface AdminRunStoreState {
  runs: Run[];
  timelinesByRunId: Record<string, AdminRunTimeline>;
  selectedRunId: string | null;
  loadingRuns: boolean;
  loadingTimelineByRunId: Record<string, boolean>;
  error: string | null;
  loadRuns: (options?: {
    status?: Run["status"];
    parentRunId?: string;
  }) => Promise<void>;
  loadTimeline: (runId: string) => Promise<void>;
  selectRun: (runId: string | null) => void;
  clear: () => void;
}

export const createAdminRunStore = (
  client: Pick<ControlPlaneClient, "listAdminRuns" | "getAdminRunTimeline">
) =>
  createStore<AdminRunStoreState>((set) => ({
    runs: [],
    timelinesByRunId: {},
    selectedRunId: null,
    loadingRuns: false,
    loadingTimelineByRunId: {},
    error: null,
    loadRuns: async (options = {}) => {
      set({
        loadingRuns: true,
        error: null
      });

      try {
        const runs = await client.listAdminRuns(options);
        set({
          runs: sortRunsByCreatedAt(runs),
          loadingRuns: false,
          error: null
        });
      } catch (error) {
        set({
          loadingRuns: false,
          error: error instanceof Error ? error.message : "Failed to load admin runs"
        });
      }
    },
    loadTimeline: async (runId) => {
      set((state) => ({
        loadingTimelineByRunId: {
          ...state.loadingTimelineByRunId,
          [runId]: true
        },
        error: null
      }));

      try {
        const timeline = await client.getAdminRunTimeline(runId);
        set((state) => ({
          timelinesByRunId: {
            ...state.timelinesByRunId,
            [runId]: timeline
          },
          loadingTimelineByRunId: {
            ...state.loadingTimelineByRunId,
            [runId]: false
          },
          error: null
        }));
      } catch (error) {
        set((state) => ({
          loadingTimelineByRunId: {
            ...state.loadingTimelineByRunId,
            [runId]: false
          },
          error:
            error instanceof Error
              ? error.message
              : `Failed to load admin run timeline: ${runId}`
        }));
      }
    },
    selectRun: (runId) =>
      set({
        selectedRunId: runId
      }),
    clear: () =>
      set({
        runs: [],
        timelinesByRunId: {},
        selectedRunId: null,
        loadingRuns: false,
        loadingTimelineByRunId: {},
        error: null
      })
  }));

export const adminRunStore = createAdminRunStore({
  listAdminRuns: (...args) =>
    import("../runtime/control-plane-client").then(({ createControlPlaneClient }) =>
      createControlPlaneClient().listAdminRuns(...args)
    ),
  getAdminRunTimeline: (...args) =>
    import("../runtime/control-plane-client").then(({ createControlPlaneClient }) =>
      createControlPlaneClient().getAdminRunTimeline(...args)
    )
});

export const useAdminRunStore = <T>(
  selector: (state: AdminRunStoreState) => T
): T => useStore(adminRunStore, selector);
