import type { Run } from "@geohelper/agent-protocol";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

import type { ControlPlaneClient } from "../runtime/control-plane-client";
import type { AdminRunTimeline } from "../runtime/types";

const sortRunsByCreatedAt = (runs: Run[]): Run[] =>
  [...runs].sort((left, right) => left.createdAt.localeCompare(right.createdAt));

export type AdminRunTimelineSyncStatus = "idle" | "syncing" | "retrying" | "error";

export interface AdminRunTimelineSyncState {
  active: boolean;
  status: AdminRunTimelineSyncStatus;
  error: string | null;
  retryCount: number;
}

const createIdleTimelineSyncState = (): AdminRunTimelineSyncState => ({
  active: false,
  status: "idle",
  error: null,
  retryCount: 0
});

const getErrorMessage = (error: unknown, runId?: string): string =>
  error instanceof Error
    ? error.message
    : runId
      ? `Failed to load admin run timeline: ${runId}`
      : "Failed to load admin runs";

export interface AdminRunStoreState {
  runs: Run[];
  timelinesByRunId: Record<string, AdminRunTimeline>;
  timelineSyncStateByRunId: Record<string, AdminRunTimelineSyncState>;
  selectedRunId: string | null;
  loadingRuns: boolean;
  loadingTimelineByRunId: Record<string, boolean>;
  error: string | null;
  loadRuns: (options?: {
    status?: Run["status"];
    parentRunId?: string;
  }) => Promise<void>;
  loadTimeline: (runId: string) => Promise<void>;
  refreshTimeline: (runId: string) => Promise<AdminRunTimeline>;
  setTimelineSyncState: (
    runId: string,
    syncState: AdminRunTimelineSyncState
  ) => void;
  selectRun: (runId: string | null) => void;
  clear: () => void;
}

export const createAdminRunStore = (
  client: Pick<ControlPlaneClient, "listAdminRuns" | "getAdminRunTimeline">
) =>
  createStore<AdminRunStoreState>((set, get) => ({
    runs: [],
    timelinesByRunId: {},
    timelineSyncStateByRunId: {},
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
          error: getErrorMessage(error)
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
          timelineSyncStateByRunId: {
            ...state.timelineSyncStateByRunId,
            [runId]: createIdleTimelineSyncState()
          },
          error: null
        }));
      } catch (error) {
        const errorMessage = getErrorMessage(error, runId);
        set((state) => ({
          loadingTimelineByRunId: {
            ...state.loadingTimelineByRunId,
            [runId]: false
          },
          timelineSyncStateByRunId: {
            ...state.timelineSyncStateByRunId,
            [runId]: {
              active: false,
              status: "error",
              error: errorMessage,
              retryCount: 0
            }
          },
          error: errorMessage
        }));
      }
    },
    refreshTimeline: async (runId) => {
      if (!get().timelinesByRunId[runId]) {
        await get().loadTimeline(runId);
        const timeline = get().timelinesByRunId[runId];

        if (!timeline) {
          throw new Error(`Failed to load admin run timeline: ${runId}`);
        }

        return timeline;
      }

      try {
        const timeline = await client.getAdminRunTimeline(runId);
        set((state) => ({
          timelinesByRunId: {
            ...state.timelinesByRunId,
            [runId]: timeline
          },
          error: null
        }));
        return timeline;
      } catch (error) {
        set({
          error: getErrorMessage(error, runId)
        });
        throw error;
      }
    },
    setTimelineSyncState: (runId, syncState) =>
      set((state) => ({
        timelineSyncStateByRunId: {
          ...state.timelineSyncStateByRunId,
          [runId]: syncState
        }
      })),
    selectRun: (runId) =>
      set({
        selectedRunId: runId
      }),
    clear: () =>
      set({
        runs: [],
        timelinesByRunId: {},
        timelineSyncStateByRunId: {},
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
