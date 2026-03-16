import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

import {
  ChatMode,
  RemoteBackupSyncStatus,
  RuntimeBackupCompareResponse,
  RuntimeBackupMetadata,
  RuntimeCapabilities,
  RuntimeTarget
} from "../runtime/types";
import {
  browserSecretService,
  EncryptedSecret,
  SecretService
} from "../services/secure-secret";
import type { PersistedSettingsSnapshot } from "./settings-persistence";
import {
  loadSettingsSnapshot,
  saveSettingsSnapshot
} from "./settings-persistence";
import {
  buildCompileRuntimeOptions,
  maybeAppendDebugEvent,
  resolveRuntimeProfileSelection
} from "./settings-runtime-resolver";

export interface ModelPresetBase {
  id: string;
  name: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  updatedAt: number;
}

export interface ByokPreset extends ModelPresetBase {
  endpoint: string;
  apiKeyCipher?: EncryptedSecret;
}

export interface OfficialPreset extends ModelPresetBase {}

export interface SessionOverride {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  retryAttempts?: number;
}

export interface ExperimentFlags {
  showAgentSteps: boolean;
  autoRetryEnabled: boolean;
  requestTimeoutEnabled: boolean;
  strictValidationEnabled: boolean;
  fallbackSingleAgentEnabled: boolean;
  debugLogPanelEnabled: boolean;
  performanceSamplingEnabled: boolean;
}

export interface DebugEvent {
  id: string;
  time: number;
  level: "info" | "error";
  message: string;
}

export interface ByokRuntimeIssue {
  code: "BYOK_KEY_DECRYPT_FAILED";
  presetId: string;
  presetName: string;
  message: string;
}

export type RemoteBackupSyncMode = "off" | "remind_only" | "delayed_upload";

export interface RemoteBackupSyncPreferences {
  mode: RemoteBackupSyncMode;
}

export interface RemoteBackupSyncState {
  status: RemoteBackupSyncStatus;
  latestRemoteBackup: RuntimeBackupMetadata | null;
  history: RuntimeBackupMetadata[];
  lastComparison: RuntimeBackupCompareResponse | null;
  lastCheckedAt: string | null;
  lastError: string | null;
}

export interface RemoteBackupSyncResultInput {
  status?: RemoteBackupSyncStatus;
  latestRemoteBackup?: RuntimeBackupMetadata | null;
  history?: RuntimeBackupMetadata[];
  comparison: RuntimeBackupCompareResponse;
  checkedAt?: string;
}

export interface RuntimeProfile {
  id: string;
  name: string;
  target: RuntimeTarget;
  baseUrl: string;
  updatedAt: number;
}

export interface SettingsStoreState extends PersistedSettingsSnapshot {
  drawerOpen: boolean;
  byokRuntimeIssue: ByokRuntimeIssue | null;
  remoteBackupSyncPreferences: RemoteBackupSyncPreferences;
  remoteBackupSync: RemoteBackupSyncState;
  setDrawerOpen: (open: boolean) => void;
  setByokRuntimeIssue: (issue: ByokRuntimeIssue | null) => void;
  setRemoteBackupSyncMode: (mode: RemoteBackupSyncMode) => void;
  beginRemoteBackupSyncCheck: () => void;
  beginRemoteBackupSyncUpload: () => void;
  setRemoteBackupSyncResult: (input: RemoteBackupSyncResultInput) => void;
  setRemoteBackupSyncError: (message: string) => void;
  applyRemoteBackupSnapshotUpdate: (backup: RuntimeBackupMetadata) => void;
  upsertRuntimeProfile: (input: {
    id?: string;
    name: string;
    target: RuntimeTarget;
    baseUrl: string;
  }) => string;
  setDefaultRuntimeProfile: (id: string) => void;
  setDefaultMode: (mode: ChatMode) => void;
  setRemoteBackupAdminToken: (token: string) => Promise<void>;
  readRemoteBackupAdminToken: () => Promise<string | null>;
  clearRemoteBackupAdminToken: () => void;
  upsertByokPreset: (input: {
    id?: string;
    name: string;
    model: string;
    endpoint: string;
    temperature: number;
    maxTokens: number;
    timeoutMs: number;
    apiKey?: string;
  }) => Promise<string>;
  removeByokPreset: (id: string) => void;
  setDefaultByokPreset: (id: string) => void;
  upsertOfficialPreset: (input: {
    id?: string;
    name: string;
    model: string;
    temperature: number;
    maxTokens: number;
    timeoutMs: number;
  }) => string;
  removeOfficialPreset: (id: string) => void;
  setDefaultOfficialPreset: (id: string) => void;
  setSessionOverride: (conversationId: string, patch: SessionOverride) => void;
  clearSessionOverride: (conversationId: string) => void;
  setExperimentFlag: <K extends keyof ExperimentFlags>(
    key: K,
    value: ExperimentFlags[K]
  ) => void;
  setDefaultRetryAttempts: (count: number) => void;
  appendDebugEvent: (event: Omit<DebugEvent, "id" | "time">) => void;
  clearDebugEvents: () => void;
  clearStoredSecrets: () => Promise<void>;
}

export interface CompileRuntimeOptions {
  runtimeTarget: RuntimeTarget;
  runtimeBaseUrl?: string;
  runtimeCapabilities: RuntimeCapabilities;
  model?: string;
  byokEndpoint?: string;
  byokKey?: string;
  byokRuntimeIssue?: ByokRuntimeIssue;
  timeoutMs?: number;
  retryAttempts: number;
  extraHeaders: Record<string, string>;
}

interface SettingsStoreDeps {
  secretService: SecretService;
}

const DEBUG_EVENT_LIMIT = 100;

const clampNumber = (
  value: number,
  options: {
    min: number;
    max: number;
    fallback: number;
  }
): number => {
  if (Number.isNaN(value)) {
    return options.fallback;
  }
  return Math.min(options.max, Math.max(options.min, value));
};

const makeId = (): string => `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

const createInitialRemoteBackupSyncState = (): RemoteBackupSyncState => ({
  status: "idle",
  latestRemoteBackup: null,
  history: [],
  lastComparison: null,
  lastCheckedAt: null,
  lastError: null
});

const applyRemoteBackupSnapshotToHistory = (
  history: RuntimeBackupMetadata[],
  backup: RuntimeBackupMetadata
): RuntimeBackupMetadata[] => {
  const existing = history.some((item) => item.snapshot_id === backup.snapshot_id);
  if (existing) {
    return history.map((item) =>
      item.snapshot_id === backup.snapshot_id ? backup : item
    );
  }

  return [backup, ...history];
};

const applyRemoteBackupSnapshotToComparison = (
  comparison: RuntimeBackupCompareResponse | null,
  backup: RuntimeBackupMetadata
): RuntimeBackupCompareResponse | null => {
  if (!comparison?.remote_snapshot) {
    return comparison;
  }

  if (comparison.remote_snapshot.summary.snapshot_id !== backup.snapshot_id) {
    return comparison;
  }

  return {
    ...comparison,
    remote_snapshot: {
      summary: backup
    }
  };
};

const mapComparisonResultToSyncStatus = (
  result: RuntimeBackupCompareResponse["comparison_result"]
): RemoteBackupSyncStatus =>
  result === "identical" ? "up_to_date" : result;

const sanitizePresetNumeric = <
  T extends {
    temperature: number;
    maxTokens: number;
    timeoutMs: number;
  }
>(
  preset: T
): T => ({
  ...preset,
  temperature: clampNumber(preset.temperature, {
    min: 0,
    max: 2,
    fallback: 0.2
  }),
  maxTokens: clampNumber(preset.maxTokens, {
    min: 64,
    max: 32_000,
    fallback: 1200
  }),
  timeoutMs: clampNumber(preset.timeoutMs, {
    min: 1_000,
    max: 120_000,
    fallback: 20_000
  })
});

export const createSettingsStore = (
  depsOverride: Partial<SettingsStoreDeps> = {}
) => {
  const deps: SettingsStoreDeps = {
    secretService: browserSecretService,
    ...depsOverride
  };
  const initial = loadSettingsSnapshot();

  const saveState = (
    state: Omit<SettingsStoreState, "drawerOpen"> & {
      drawerOpen?: boolean;
    }
  ) => {
    saveSettingsSnapshot({
      schemaVersion: 3,
      defaultMode: state.defaultMode,
      runtimeProfiles: state.runtimeProfiles,
      defaultRuntimeProfileId: state.defaultRuntimeProfileId,
      byokPresets: state.byokPresets,
      officialPresets: state.officialPresets,
      defaultByokPresetId: state.defaultByokPresetId,
      defaultOfficialPresetId: state.defaultOfficialPresetId,
      remoteBackupAdminTokenCipher: state.remoteBackupAdminTokenCipher,
      remoteBackupSyncPreferences: state.remoteBackupSyncPreferences,
      sessionOverrides: state.sessionOverrides,
      experimentFlags: state.experimentFlags,
      requestDefaults: state.requestDefaults,
      debugEvents: state.debugEvents
    });
  };

  return createStore<SettingsStoreState>((set, get) => ({
    ...initial,
    drawerOpen: false,
    byokRuntimeIssue: null,
    remoteBackupSync: createInitialRemoteBackupSyncState(),
    setRemoteBackupSyncMode: (mode) =>
      set((state) => {
        const next = {
          ...state,
          remoteBackupSyncPreferences: {
            mode
          }
        };
        saveState(next);
        return {
          remoteBackupSyncPreferences: {
            mode
          }
        };
      }),
    setDrawerOpen: (open) =>
      set(() => ({
        drawerOpen: open
      })),
    setByokRuntimeIssue: (issue) =>
      set(() => ({
        byokRuntimeIssue: issue
      })),
    beginRemoteBackupSyncCheck: () =>
      set((state) => ({
        remoteBackupSync: {
          ...state.remoteBackupSync,
          status: "checking",
          lastError: null
        }
      })),
    beginRemoteBackupSyncUpload: () =>
      set((state) => ({
        remoteBackupSync: {
          ...state.remoteBackupSync,
          status: "uploading",
          lastError: null
        }
      })),
    setRemoteBackupSyncResult: (input) =>
      set((state) => ({
        remoteBackupSync: {
          status:
            input.status ??
            mapComparisonResultToSyncStatus(input.comparison.comparison_result),
          latestRemoteBackup:
            input.latestRemoteBackup ??
            input.comparison.remote_snapshot?.summary ??
            state.remoteBackupSync.latestRemoteBackup,
          history: input.history ?? state.remoteBackupSync.history,
          lastComparison: input.comparison,
          lastCheckedAt:
            input.checkedAt ?? state.remoteBackupSync.lastCheckedAt,
          lastError: null
        }
      })),
    setRemoteBackupSyncError: (message) =>
      set((state) => ({
        remoteBackupSync: {
          ...state.remoteBackupSync,
          status: "idle",
          lastComparison: null,
          lastError: message
        }
      })),
    applyRemoteBackupSnapshotUpdate: (backup) =>
      set((state) => {
        const history = applyRemoteBackupSnapshotToHistory(
          state.remoteBackupSync.history,
          backup
        );
        const latestRemoteBackup =
          state.remoteBackupSync.latestRemoteBackup?.snapshot_id === backup.snapshot_id
            ? backup
            : state.remoteBackupSync.latestRemoteBackup;

        return {
          remoteBackupSync: {
            ...state.remoteBackupSync,
            latestRemoteBackup,
            history,
            lastComparison: applyRemoteBackupSnapshotToComparison(
              state.remoteBackupSync.lastComparison,
              backup
            )
          }
        };
      }),
    upsertRuntimeProfile: (input) => {
      const id = input.id ?? `runtime_${makeId()}`;
      set((state) => {
        const existing = state.runtimeProfiles.find((item) => item.id === id);
        const merged: RuntimeProfile = {
          id,
          name:
            input.name.trim() ||
            (input.target === "gateway" ? "Gateway" : "Direct BYOK"),
          target: input.target,
          baseUrl: input.baseUrl.trim().replace(/\/+$/, ""),
          updatedAt: Date.now()
        };
        const runtimeProfiles = existing
          ? state.runtimeProfiles.map((item) => (item.id === id ? merged : item))
          : [merged, ...state.runtimeProfiles];
        const defaultRuntimeProfileId =
          state.defaultRuntimeProfileId || runtimeProfiles[0].id;
        const next = {
          ...state,
          runtimeProfiles,
          defaultRuntimeProfileId
        };
        saveState(next);
        return {
          runtimeProfiles,
          defaultRuntimeProfileId
        };
      });

      return id;
    },
    setDefaultRuntimeProfile: (id) =>
      set((state) => {
        if (!state.runtimeProfiles.some((item) => item.id === id)) {
          return {};
        }
        const next = {
          ...state,
          defaultRuntimeProfileId: id
        };
        saveState(next);
        return {
          defaultRuntimeProfileId: id
        };
      }),
    setDefaultMode: (mode) =>
      set((state) => {
        const next = {
          ...state,
          defaultMode: mode
        };
        saveState(next);
        return {
          defaultMode: mode
        };
      }),
    setRemoteBackupAdminToken: async (token) => {
      const normalized = token.trim();
      const cipher = normalized
        ? await deps.secretService.encrypt(normalized)
        : undefined;

      set((state) => {
        const next = {
          ...state,
          remoteBackupAdminTokenCipher: cipher
        };
        saveState(next);
        return {
          remoteBackupAdminTokenCipher: cipher
        };
      });
    },
    readRemoteBackupAdminToken: async () => {
      const cipher = get().remoteBackupAdminTokenCipher;
      if (!cipher) {
        return null;
      }

      return deps.secretService.decrypt(cipher);
    },
    clearRemoteBackupAdminToken: () =>
      set((state) => {
        if (!state.remoteBackupAdminTokenCipher) {
          return {};
        }

        const next = {
          ...state,
          remoteBackupAdminTokenCipher: undefined
        };
        saveState(next);
        return {
          remoteBackupAdminTokenCipher: undefined
        };
      }),
    upsertByokPreset: async (input) => {
      const keyCipher =
        input.apiKey && input.apiKey.trim()
          ? await deps.secretService.encrypt(input.apiKey.trim())
          : undefined;
      const id = input.id ?? `byok_${makeId()}`;

      set((state) => {
        const shouldClearRuntimeIssue =
          Boolean(input.apiKey?.trim()) &&
          state.byokRuntimeIssue?.presetId === id;
        const existing = state.byokPresets.find((item) => item.id === id);
        const merged = sanitizePresetNumeric({
          id,
          name: input.name.trim() || "未命名 BYOK",
          model: input.model.trim() || "gpt-4o-mini",
          endpoint: input.endpoint.trim(),
          temperature: input.temperature,
          maxTokens: input.maxTokens,
          timeoutMs: input.timeoutMs,
          updatedAt: Date.now(),
          apiKeyCipher: keyCipher ?? existing?.apiKeyCipher
        });
        const byokPresets = existing
          ? state.byokPresets.map((item) => (item.id === id ? merged : item))
          : [merged, ...state.byokPresets];
        const defaultByokPresetId =
          state.defaultByokPresetId || byokPresets[0].id;
        const next = {
          ...state,
          byokPresets,
          defaultByokPresetId
        };
        saveState(next);
        return {
          byokPresets,
          defaultByokPresetId,
          byokRuntimeIssue: shouldClearRuntimeIssue
            ? null
            : state.byokRuntimeIssue
        };
      });

      return id;
    },
    removeByokPreset: (id) =>
      set((state) => {
        if (state.byokPresets.length <= 1) {
          return {};
        }
        const byokPresets = state.byokPresets.filter((item) => item.id !== id);
        const defaultByokPresetId = byokPresets.some(
          (item) => item.id === state.defaultByokPresetId
        )
          ? state.defaultByokPresetId
          : byokPresets[0].id;
        const next = {
          ...state,
          byokPresets,
          defaultByokPresetId
        };
        saveState(next);
        return {
          byokPresets,
          defaultByokPresetId
        };
      }),
    setDefaultByokPreset: (id) =>
      set((state) => {
        if (!state.byokPresets.some((item) => item.id === id)) {
          return {};
        }
        const next = {
          ...state,
          defaultByokPresetId: id
        };
        saveState(next);
        return {
          defaultByokPresetId: id
        };
      }),
    upsertOfficialPreset: (input) => {
      const id = input.id ?? `official_${makeId()}`;
      set((state) => {
        const existing = state.officialPresets.find((item) => item.id === id);
        const merged = sanitizePresetNumeric({
          id,
          name: input.name.trim() || "未命名 Official",
          model: input.model.trim() || "gpt-4o-mini",
          temperature: input.temperature,
          maxTokens: input.maxTokens,
          timeoutMs: input.timeoutMs,
          updatedAt: Date.now()
        });
        const officialPresets = existing
          ? state.officialPresets.map((item) => (item.id === id ? merged : item))
          : [merged, ...state.officialPresets];
        const defaultOfficialPresetId =
          state.defaultOfficialPresetId || officialPresets[0].id;
        const next = {
          ...state,
          officialPresets,
          defaultOfficialPresetId
        };
        saveState(next);
        return {
          officialPresets,
          defaultOfficialPresetId
        };
      });

      return id;
    },
    removeOfficialPreset: (id) =>
      set((state) => {
        if (state.officialPresets.length <= 1) {
          return {};
        }
        const officialPresets = state.officialPresets.filter(
          (item) => item.id !== id
        );
        const defaultOfficialPresetId = officialPresets.some(
          (item) => item.id === state.defaultOfficialPresetId
        )
          ? state.defaultOfficialPresetId
          : officialPresets[0].id;
        const next = {
          ...state,
          officialPresets,
          defaultOfficialPresetId
        };
        saveState(next);
        return {
          officialPresets,
          defaultOfficialPresetId
        };
      }),
    setDefaultOfficialPreset: (id) =>
      set((state) => {
        if (!state.officialPresets.some((item) => item.id === id)) {
          return {};
        }
        const next = {
          ...state,
          defaultOfficialPresetId: id
        };
        saveState(next);
        return {
          defaultOfficialPresetId: id
        };
      }),
    setSessionOverride: (conversationId, patch) =>
      set((state) => {
        const existing = state.sessionOverrides[conversationId] ?? {};
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
        const sessionOverrides = {
          ...state.sessionOverrides,
          [conversationId]: normalized
        };
        const next = {
          ...state,
          sessionOverrides
        };
        saveState(next);
        return {
          sessionOverrides
        };
      }),
    clearSessionOverride: (conversationId) =>
      set((state) => {
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
        saveState(next);
        return {
          sessionOverrides
        };
      }),
    setExperimentFlag: (key, value) =>
      set((state) => {
        const experimentFlags = {
          ...state.experimentFlags,
          [key]: value
        };
        const next = {
          ...state,
          experimentFlags
        };
        saveState(next);
        return {
          experimentFlags
        };
      }),
    setDefaultRetryAttempts: (count) =>
      set((state) => {
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
        saveState(next);
        return {
          requestDefaults
        };
      }),
    appendDebugEvent: (event) =>
      set((state) => {
        const debugEvents = [
          {
            id: `dbg_${makeId()}`,
            time: Date.now(),
            level: event.level,
            message: event.message
          },
          ...state.debugEvents
        ].slice(0, DEBUG_EVENT_LIMIT);
        const next = {
          ...state,
          debugEvents
        };
        saveState(next);
        return {
          debugEvents
        };
      }),
    clearDebugEvents: () =>
      set((state) => {
        const next = {
          ...state,
          debugEvents: []
        };
        saveState(next);
        return {
          debugEvents: []
        };
      }),
    clearStoredSecrets: async () => {
      await deps.secretService.clear();
      set((state) => {
        const byokPresets = state.byokPresets.map((preset) => ({
          ...preset,
          apiKeyCipher: undefined
        }));
        const next = {
          ...state,
          byokPresets,
          remoteBackupAdminTokenCipher: undefined
        };
        saveState(next);
        return {
          byokPresets,
          remoteBackupAdminTokenCipher: undefined,
          byokRuntimeIssue: null
        };
      });
    }
  }));
};

export const settingsStore = createSettingsStore();

const applySettingsSnapshotToStore = (
  store: ReturnType<typeof createSettingsStore>,
  snapshot: PersistedSettingsSnapshot
): PersistedSettingsSnapshot => {
  store.setState((state) => ({
    schemaVersion: snapshot.schemaVersion,
    defaultMode: snapshot.defaultMode,
    runtimeProfiles: snapshot.runtimeProfiles,
    defaultRuntimeProfileId: snapshot.defaultRuntimeProfileId,
    byokPresets: snapshot.byokPresets,
    officialPresets: snapshot.officialPresets,
    defaultByokPresetId: snapshot.defaultByokPresetId,
    defaultOfficialPresetId: snapshot.defaultOfficialPresetId,
    remoteBackupAdminTokenCipher: snapshot.remoteBackupAdminTokenCipher,
    remoteBackupSyncPreferences: snapshot.remoteBackupSyncPreferences,
    sessionOverrides: snapshot.sessionOverrides,
    experimentFlags: snapshot.experimentFlags,
    requestDefaults: snapshot.requestDefaults,
    debugEvents: snapshot.debugEvents,
    drawerOpen: state.drawerOpen,
    byokRuntimeIssue: state.byokRuntimeIssue,
    remoteBackupSync: state.remoteBackupSync
  }));
  return snapshot;
};

export const syncSettingsStoreFromStorage = (
  store: ReturnType<typeof createSettingsStore> = settingsStore
): PersistedSettingsSnapshot =>
  applySettingsSnapshotToStore(store, loadSettingsSnapshot());

export const useSettingsStore = <T>(
  selector: (state: SettingsStoreState) => T
): T => useStore(settingsStore, selector);

export { inferModelSupportsVision, resolveRuntimeCapabilitiesForModel } from "../runtime/types";
export { SETTINGS_KEY } from "./settings-persistence";

export const resolveRuntimeProfile = (): {
  profile: RuntimeProfile;
  capabilities: RuntimeCapabilities;
} => resolveRuntimeProfileSelection(settingsStore.getState());

export const resolveCompileRuntimeOptions = async (params: {
  conversationId: string;
  mode: ChatMode;
}): Promise<CompileRuntimeOptions> => {
  const state = settingsStore.getState();
  const resolved = await buildCompileRuntimeOptions({
    state,
    conversationId: params.conversationId,
    mode: params.mode
  });

  if (
    resolved.didResolveByokKey &&
    state.byokRuntimeIssue?.presetId === resolved.resolvedByokPresetId &&
    !resolved.byokRuntimeIssue
  ) {
    settingsStore.getState().setByokRuntimeIssue(null);
  }

  if (resolved.byokRuntimeIssue) {
    settingsStore.getState().setByokRuntimeIssue(resolved.byokRuntimeIssue);
    for (const event of maybeAppendDebugEvent(state, {
      level: "error",
      message: "BYOK Key 解密失败，已跳过本次 key 注入"
    })) {
      settingsStore.getState().appendDebugEvent(event);
    }
  }

  const {
    resolvedByokPresetId: _resolvedByokPresetId,
    didResolveByokKey: _didResolveByokKey,
    ...compileOptions
  } = resolved;
  return compileOptions;
};

export const appendDebugEventIfEnabled = (event: {
  level: "info" | "error";
  message: string;
}): void => {
  const state = settingsStore.getState();
  for (const enabledEvent of maybeAppendDebugEvent(state, event)) {
    state.appendDebugEvent(enabledEvent);
  }
};
