import type {
  DebugEvent,
  ExperimentFlags,
  SessionOverride,
  SettingsStoreState
} from "../settings-store";
import { clampNumber, makeId } from "./runtime-and-presets";

type SettingsSet = (
  updater: (state: SettingsStoreState) => Partial<SettingsStoreState> | {}
) => void;

type PersistableSettingsState = Omit<SettingsStoreState, "drawerOpen"> & {
  drawerOpen?: boolean;
};

interface SessionAndDebugSliceDeps {
  set: SettingsSet;
  saveState: (state: PersistableSettingsState) => void;
}

const DEBUG_EVENT_LIMIT = 100;

export const buildSessionOverridePatch = (
  existing: SessionOverride,
  patch: SessionOverride
): SessionOverride => {
  const normalized: SessionOverride = {
    ...existing,
    ...patch
  };

  if (typeof normalized.temperature === "number") {
    normalized.temperature = clampNumber(normalized.temperature, {
      min: 0,
      max: 2,
      fallback: 0.2
    });
  }
  if (typeof normalized.maxTokens === "number") {
    normalized.maxTokens = clampNumber(normalized.maxTokens, {
      min: 64,
      max: 32_000,
      fallback: 1200
    });
  }
  if (typeof normalized.timeoutMs === "number") {
    normalized.timeoutMs = clampNumber(normalized.timeoutMs, {
      min: 1_000,
      max: 120_000,
      fallback: 20_000
    });
  }
  if (typeof normalized.retryAttempts === "number") {
    normalized.retryAttempts = clampNumber(normalized.retryAttempts, {
      min: 0,
      max: 5,
      fallback: 1
    });
  }

  return normalized;
};

export const buildNextDebugEvents = (
  current: DebugEvent[],
  event: DebugEvent
): DebugEvent[] => [event, ...current].slice(0, DEBUG_EVENT_LIMIT);

export const createSessionAndDebugActions = (
  deps: SessionAndDebugSliceDeps
) => ({
  setSessionOverride: (conversationId: string, patch: SessionOverride) =>
    deps.set((state) => {
      const sessionOverrides = {
        ...state.sessionOverrides,
        [conversationId]: buildSessionOverridePatch(
          state.sessionOverrides[conversationId] ?? {},
          patch
        )
      };
      const next = {
        ...state,
        sessionOverrides
      };
      deps.saveState(next);
      return {
        sessionOverrides
      };
    }),
  clearSessionOverride: (conversationId: string) =>
    deps.set((state) => {
      if (!state.sessionOverrides[conversationId]) {
        return {};
      }
      const sessionOverrides = {
        ...state.sessionOverrides
      };
      delete sessionOverrides[conversationId];
      const next = {
        ...state,
        sessionOverrides
      };
      deps.saveState(next);
      return {
        sessionOverrides
      };
    }),
  setExperimentFlag: <K extends keyof ExperimentFlags>(
    key: K,
    value: ExperimentFlags[K]
  ) =>
    deps.set((state) => {
      const experimentFlags = {
        ...state.experimentFlags,
        [key]: value
      };
      const next = {
        ...state,
        experimentFlags
      };
      deps.saveState(next);
      return {
        experimentFlags
      };
    }),
  setDefaultRetryAttempts: (count: number) =>
    deps.set((state) => {
      const requestDefaults = {
        ...state.requestDefaults,
        retryAttempts: clampNumber(count, {
          min: 0,
          max: 5,
          fallback: 1
        })
      };
      const next = {
        ...state,
        requestDefaults
      };
      deps.saveState(next);
      return {
        requestDefaults
      };
    }),
  appendDebugEvent: (event: Omit<DebugEvent, "id" | "time">) =>
    deps.set((state) => {
      const debugEvents = buildNextDebugEvents(state.debugEvents, {
        id: `dbg_${makeId()}`,
        time: Date.now(),
        level: event.level,
        message: event.message
      });
      const next = {
        ...state,
        debugEvents
      };
      deps.saveState(next);
      return {
        debugEvents
      };
    }),
  clearDebugEvents: () =>
    deps.set((state) => {
      const next = {
        ...state,
        debugEvents: []
      };
      deps.saveState(next);
      return {
        debugEvents: []
      };
    })
});
