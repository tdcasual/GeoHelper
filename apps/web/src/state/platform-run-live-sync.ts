import type { Run } from "@geohelper/agent-protocol";

import type { ControlPlaneClient } from "../runtime/control-plane-client";
import {
  recordPlatformRunSnapshot as defaultRecordPlatformRunSnapshot,
  type PlatformRunRecorder
} from "./platform-run-recorder";

export type PlatformRunLiveSyncStatus = "idle" | "syncing" | "retrying" | "error";

export interface PlatformRunLiveSyncState {
  active: boolean;
  status: PlatformRunLiveSyncStatus;
  error: string | null;
  retryCount: number;
}

interface PlatformRunLiveSyncDeps {
  runId: string;
  client: Pick<ControlPlaneClient, "streamRun" | "listDelegationSessions">;
  recordPlatformRunSnapshot?: PlatformRunRecorder;
  pollIntervalMs?: number;
  retryDelayMs?: number;
  maxRetryCount?: number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}

export interface PlatformRunLiveSyncController {
  getState: () => PlatformRunLiveSyncState;
  subscribe: (
    listener: (state: PlatformRunLiveSyncState) => void
  ) => () => void;
  start: () => Promise<void>;
  stop: () => void;
}

const TERMINAL_RUN_STATUSES = new Set<Run["status"]>([
  "completed",
  "failed",
  "cancelled"
]);

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Failed to refresh platform run";

const getLatestSequence = (run: { events: Array<{ sequence: number }> }): number | undefined =>
  run.events.reduce<number | undefined>(
    (latestSequence, event) =>
      latestSequence === undefined || event.sequence > latestSequence
        ? event.sequence
        : latestSequence,
    undefined
  );

export const createPlatformRunLiveSyncController = ({
  runId,
  client,
  recordPlatformRunSnapshot = defaultRecordPlatformRunSnapshot,
  pollIntervalMs = 2_000,
  retryDelayMs = 5_000,
  maxRetryCount = 3,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout
}: PlatformRunLiveSyncDeps): PlatformRunLiveSyncController => {
  let state: PlatformRunLiveSyncState = {
    active: false,
    status: "idle",
    error: null,
    retryCount: 0
  };
  let afterSequence: number | undefined;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlightSync: Promise<void> | null = null;
  const listeners = new Set<(nextState: PlatformRunLiveSyncState) => void>();

  const emit = (nextState: PlatformRunLiveSyncState) => {
    state = nextState;
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
    emit({
      active: false,
      status: "idle",
      error: null,
      retryCount: 0
    });
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
      const [snapshot, delegationSessions] = await Promise.all([
        client.streamRun(runId, afterSequence === undefined ? {} : { afterSequence }),
        client.listDelegationSessions({
          runId
        })
      ]);

      if (!state.active) {
        return;
      }

      recordPlatformRunSnapshot({
        snapshot,
        delegationSessions
      });

      const latestSequence = getLatestSequence(snapshot);
      if (latestSequence !== undefined) {
        afterSequence = latestSequence;
      }

      const terminal = TERMINAL_RUN_STATUSES.has(snapshot.run.status);
      emit({
        active: !terminal,
        status: "idle",
        error: null,
        retryCount: 0
      });

      if (!terminal) {
        scheduleSync(pollIntervalMs, sync);
      }
    } catch (error) {
      if (!state.active) {
        return;
      }

      const retryCount = state.retryCount + 1;
      const errorMessage = getErrorMessage(error);

      if (retryCount > maxRetryCount) {
        clearTimer();
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
      emit({
        active: true,
        status: "idle",
        error: null,
        retryCount: 0
      });

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
