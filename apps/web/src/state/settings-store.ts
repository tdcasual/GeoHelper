import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

import {
  ChatMode,
  PlatformRunProfile,
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
import {
  createInitialRemoteBackupSyncState,
  createRemoteBackupActions
} from "./settings-store-slices/remote-backup";
import { createRuntimeAndPresetActions } from "./settings-store-slices/runtime-and-presets";
import { createSessionAndDebugActions } from "./settings-store-slices/session-and-debug";

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
  debugLogPanelEnabled: boolean;
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
  setDefaultPlatformAgentProfile: (id: string) => void;
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
  platformRunProfile: PlatformRunProfile;
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
      defaultPlatformAgentProfileId: state.defaultPlatformAgentProfileId,
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
    setDrawerOpen: (open) =>
      set(() => ({
        drawerOpen: open
      })),
    setByokRuntimeIssue: (issue) =>
      set(() => ({
        byokRuntimeIssue: issue
      })),
    ...createRemoteBackupActions({
      set,
      saveState
    }),
    ...createRuntimeAndPresetActions({
      set,
      get,
      saveState,
      secretService: deps.secretService
    }),
    ...createSessionAndDebugActions({
      set,
      saveState
    })
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
    defaultPlatformAgentProfileId: snapshot.defaultPlatformAgentProfileId,
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
