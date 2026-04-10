import type { Run } from "@geohelper/agent-protocol";
import type { DelegationSessionRecord } from "@geohelper/agent-store";

import type { AdminRunTimeline } from "../runtime/types";
import type { AdminRunTimelineSyncState } from "./admin-run-store";

export interface AdminRunLiveSyncController {
  getState: () => AdminRunTimelineSyncState;
  subscribe: (
    listener: (state: AdminRunTimelineSyncState) => void
  ) => () => void;
  start: () => Promise<void>;
  stop: () => void;
}

interface AdminRunLiveSyncDeps {
  runId: string;
  refreshTimeline: (runId: string) => Promise<AdminRunTimeline>;
  onStateChange?: (state: AdminRunTimelineSyncState) => void;
  pollIntervalMs?: number;
  retryDelayMs?: number;
  maxRetryCount?: number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}

const TERMINAL_RUN_STATUSES = new Set<Run["status"]>([
  "completed",
  "failed",
  "cancelled"
]);

const createIdleState = (active: boolean): AdminRunTimelineSyncState => ({
  active,
  status: "idle",
  error: null,
  retryCount: 0
});

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Failed to refresh admin run timeline";

const hasPendingClaimedDelegationSession = (
  session: DelegationSessionRecord
): boolean => session.status === "pending" && Boolean(session.claimedBy);

const shouldKeepRefreshing = (timeline: AdminRunTimeline): boolean =>
  !TERMINAL_RUN_STATUSES.has(timeline.run.status) ||
  timeline.delegationSessions.some(hasPendingClaimedDelegationSession);

export const createAdminRunLiveSyncController = ({
  runId,
  refreshTimeline,
  onStateChange,
  pollIntervalMs = 2_000,
  retryDelayMs = 5_000,
  maxRetryCount = 3,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout
}: AdminRunLiveSyncDeps): AdminRunLiveSyncController => {
  let state: AdminRunTimelineSyncState = createIdleState(false);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlightSync: Promise<void> | null = null;
  const listeners = new Set<(nextState: AdminRunTimelineSyncState) => void>();

  const emit = (nextState: AdminRunTimelineSyncState) => {
    state = nextState;
    onStateChange?.(state);
    for (const listener of listeners) {
      listener(state);
    }
  };

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeoutFn(timer);
      timer = null;
    }
  };

  const scheduleSync = (delayMs: number, sync: () => Promise<void>) => {
    clearTimer();
    timer = setTimeoutFn(() => {
      timer = null;
      void sync();
    }, delayMs);
  };

  const stop = () => {
    clearTimer();
    emit(createIdleState(false));
  };

  const sync = async (): Promise<void> => {
    if (!state.active) {
      return;
    }

    emit({
      ...state,
      status: "syncing"
    });

    try {
      const timeline = await refreshTimeline(runId);

      if (!state.active) {
        return;
      }

      const keepRefreshing = shouldKeepRefreshing(timeline);
      emit(createIdleState(keepRefreshing));

      if (keepRefreshing) {
        scheduleSync(pollIntervalMs, sync);
      }
    } catch (error) {
      if (!state.active) {
        return;
      }

      const retryCount = state.retryCount + 1;
      const errorMessage = getErrorMessage(error);

      if (retryCount > maxRetryCount) {
        emit({
          active: false,
          status: "error",
          error: errorMessage,
          retryCount
        });
        return;
      }

      emit({
        active: true,
        status: "retrying",
        error: errorMessage,
        retryCount
      });
      scheduleSync(retryDelayMs, sync);
    }
  };

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start: async () => {
      if (state.active && inFlightSync) {
        return inFlightSync;
      }

      clearTimer();
      emit(createIdleState(true));

      const syncPromise = sync();
      inFlightSync = syncPromise;

      try {
        await syncPromise;
      } finally {
        if (inFlightSync === syncPromise) {
          inFlightSync = null;
        }
      }
    },
    stop
  };
};
