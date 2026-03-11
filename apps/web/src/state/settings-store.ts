import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";

import {
  ChatMode,
  RuntimeCapabilities,
  RuntimeTarget,
  runtimeCapabilitiesByTarget
} from "../runtime/types";
import { persistSettingsSnapshotToIndexedDb } from "../storage/indexed-sync";
import {
  browserSecretService,
  EncryptedSecret,
  SecretService
} from "../services/secure-secret";

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

interface RequestDefaults {
  retryAttempts: number;
}

export interface RuntimeProfile {
  id: string;
  name: string;
  target: RuntimeTarget;
  baseUrl: string;
  updatedAt: number;
}

interface PersistedSettingsSnapshot {
  schemaVersion: 3;
  defaultMode: ChatMode;
  runtimeProfiles: RuntimeProfile[];
  defaultRuntimeProfileId: string;
  byokPresets: ByokPreset[];
  officialPresets: OfficialPreset[];
  defaultByokPresetId: string;
  defaultOfficialPresetId: string;
  remoteBackupAdminTokenCipher?: EncryptedSecret;
  sessionOverrides: Record<string, SessionOverride>;
  experimentFlags: ExperimentFlags;
  requestDefaults: RequestDefaults;
  debugEvents: DebugEvent[];
}

export interface SettingsStoreState extends PersistedSettingsSnapshot {
  drawerOpen: boolean;
  byokRuntimeIssue: ByokRuntimeIssue | null;
  setDrawerOpen: (open: boolean) => void;
  setByokRuntimeIssue: (issue: ByokRuntimeIssue | null) => void;
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

export const SETTINGS_KEY = "geohelper.settings.snapshot";
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

const readGatewayBaseUrlFromEnv = (): string => {
  const viteGatewayUrl =
    typeof import.meta !== "undefined" && import.meta.env
      ? import.meta.env.VITE_GATEWAY_URL
      : undefined;
  const processGatewayUrl =
    typeof globalThis !== "undefined" &&
    "process" in globalThis &&
    (
      globalThis as {
        process?: {
          env?: {
            VITE_GATEWAY_URL?: string;
          };
        };
      }
    ).process?.env?.VITE_GATEWAY_URL;

  const rawValue = viteGatewayUrl ?? processGatewayUrl;
  const normalized = typeof rawValue === "string" ? rawValue : "";
  return normalized.trim().replace(/\/+$/, "");
};

const createDefaultRuntimeProfiles = (): {
  runtimeProfiles: RuntimeProfile[];
  defaultRuntimeProfileId: string;
} => {
  const now = Date.now();
  const gatewayBaseUrl = readGatewayBaseUrlFromEnv();
  const gatewayProfile: RuntimeProfile = {
    id: "runtime_gateway",
    name: "Gateway",
    target: "gateway",
    baseUrl: gatewayBaseUrl,
    updatedAt: now
  };
  const directProfile: RuntimeProfile = {
    id: "runtime_direct",
    name: "Direct BYOK",
    target: "direct",
    baseUrl: "",
    updatedAt: now
  };

  return {
    runtimeProfiles: [gatewayProfile, directProfile],
    defaultRuntimeProfileId: gatewayProfile.id
  };
};

const createDefaultByokPreset = (): ByokPreset => ({
  id: `byok_${makeId()}`,
  name: "默认 BYOK",
  model: "gpt-4o-mini",
  endpoint: "",
  temperature: 0.2,
  maxTokens: 1200,
  timeoutMs: 20_000,
  updatedAt: Date.now()
});

const createDefaultOfficialPreset = (): OfficialPreset => ({
  id: `official_${makeId()}`,
  name: "默认 Official",
  model: "gpt-4o-mini",
  temperature: 0.2,
  maxTokens: 1200,
  timeoutMs: 20_000,
  updatedAt: Date.now()
});

const defaultExperimentFlags = (): ExperimentFlags => ({
  showAgentSteps: true,
  autoRetryEnabled: false,
  requestTimeoutEnabled: true,
  strictValidationEnabled: false,
  fallbackSingleAgentEnabled: false,
  debugLogPanelEnabled: false,
  performanceSamplingEnabled: false
});

const canUseStorage = (): boolean =>
  typeof localStorage !== "undefined" &&
  typeof localStorage.getItem === "function" &&
  typeof localStorage.setItem === "function";

const asEncryptedSecret = (value: unknown): EncryptedSecret | undefined => {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as Partial<EncryptedSecret>;
  if (
    candidate.version !== 1 ||
    candidate.algorithm !== "AES-GCM" ||
    typeof candidate.iv !== "string" ||
    typeof candidate.ciphertext !== "string"
  ) {
    return undefined;
  }

  return {
    version: 1,
    algorithm: "AES-GCM",
    iv: candidate.iv,
    ciphertext: candidate.ciphertext
  };
};

const makeDefaultSnapshot = (): PersistedSettingsSnapshot => {
  const runtime = createDefaultRuntimeProfiles();
  const byok = createDefaultByokPreset();
  const official = createDefaultOfficialPreset();
  return {
    schemaVersion: 3,
    defaultMode: "byok",
    runtimeProfiles: runtime.runtimeProfiles,
    defaultRuntimeProfileId: runtime.defaultRuntimeProfileId,
    byokPresets: [byok],
    officialPresets: [official],
    defaultByokPresetId: byok.id,
    defaultOfficialPresetId: official.id,
    sessionOverrides: {},
    experimentFlags: defaultExperimentFlags(),
    requestDefaults: {
      retryAttempts: 1
    },
    debugEvents: []
  };
};

const persistSnapshot = (state: PersistedSettingsSnapshot): void => {
  if (!canUseStorage()) {
    return;
  }

  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state));
  void persistSettingsSnapshotToIndexedDb(
    state as unknown as Record<string, unknown>
  );
};

const normalizeSnapshot = (
  raw: Partial<PersistedSettingsSnapshot> | null | undefined
): PersistedSettingsSnapshot => {
  const fallback = makeDefaultSnapshot();
  const runtimeProfiles =
    Array.isArray(raw?.runtimeProfiles) && raw?.runtimeProfiles.length > 0
      ? raw.runtimeProfiles
          .map((item): RuntimeProfile => ({
            id: String(item.id ?? ""),
            name:
              typeof item.name === "string" && item.name.trim()
                ? item.name
                : item.target === "gateway"
                  ? "Gateway"
                  : "Direct BYOK",
            target: item.target === "gateway" ? "gateway" : "direct",
            baseUrl:
              typeof item.baseUrl === "string"
                ? item.baseUrl.trim().replace(/\/+$/, "")
                : "",
            updatedAt:
              typeof item.updatedAt === "number" ? item.updatedAt : Date.now()
          }))
          .filter((item) => item.id.length > 0)
      : fallback.runtimeProfiles;
  const byokPresets =
    Array.isArray(raw?.byokPresets) && raw?.byokPresets.length > 0
      ? raw.byokPresets
      : fallback.byokPresets;
  const officialPresets =
    Array.isArray(raw?.officialPresets) && raw?.officialPresets.length > 0
      ? raw.officialPresets
      : fallback.officialPresets;
  const defaultByokPresetId = byokPresets.some(
    (item) => item.id === raw?.defaultByokPresetId
  )
    ? (raw?.defaultByokPresetId as string)
    : byokPresets[0].id;
  const defaultOfficialPresetId = officialPresets.some(
    (item) => item.id === raw?.defaultOfficialPresetId
  )
    ? (raw?.defaultOfficialPresetId as string)
    : officialPresets[0].id;
  const defaultRuntimeProfileId = runtimeProfiles.some(
    (item) => item.id === raw?.defaultRuntimeProfileId
  )
    ? (raw?.defaultRuntimeProfileId as string)
    : runtimeProfiles.some((item) => item.id === fallback.defaultRuntimeProfileId)
      ? fallback.defaultRuntimeProfileId
      : runtimeProfiles[0].id;

  return {
    schemaVersion: 3,
    defaultMode: raw?.defaultMode === "official" ? "official" : "byok",
    runtimeProfiles,
    defaultRuntimeProfileId,
    byokPresets,
    officialPresets,
    defaultByokPresetId,
    defaultOfficialPresetId,
    remoteBackupAdminTokenCipher: asEncryptedSecret(
      raw?.remoteBackupAdminTokenCipher
    ),
    sessionOverrides:
      raw?.sessionOverrides && typeof raw.sessionOverrides === "object"
        ? raw.sessionOverrides
        : {},
    experimentFlags: {
      ...defaultExperimentFlags(),
      ...(raw?.experimentFlags ?? {})
    },
    requestDefaults: {
      retryAttempts: clampNumber(raw?.requestDefaults?.retryAttempts ?? 1, {
        min: 0,
        max: 5,
        fallback: 1
      })
    },
    debugEvents: Array.isArray(raw?.debugEvents) ? raw.debugEvents : []
  };
};

const loadSnapshot = (): PersistedSettingsSnapshot => {
  if (!canUseStorage()) {
    return makeDefaultSnapshot();
  }

  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return makeDefaultSnapshot();
    }
    return normalizeSnapshot(JSON.parse(raw) as Partial<PersistedSettingsSnapshot>);
  } catch {
    return makeDefaultSnapshot();
  }
};

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
  const initial = loadSnapshot();

  const saveState = (
    state: Omit<SettingsStoreState, "drawerOpen"> & {
      drawerOpen?: boolean;
    }
  ) => {
    persistSnapshot({
      schemaVersion: 3,
      defaultMode: state.defaultMode,
      runtimeProfiles: state.runtimeProfiles,
      defaultRuntimeProfileId: state.defaultRuntimeProfileId,
      byokPresets: state.byokPresets,
      officialPresets: state.officialPresets,
      defaultByokPresetId: state.defaultByokPresetId,
      defaultOfficialPresetId: state.defaultOfficialPresetId,
      remoteBackupAdminTokenCipher: state.remoteBackupAdminTokenCipher,
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
    setDrawerOpen: (open) =>
      set(() => ({
        drawerOpen: open
      })),
    setByokRuntimeIssue: (issue) =>
      set(() => ({
        byokRuntimeIssue: issue
      })),
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
    sessionOverrides: snapshot.sessionOverrides,
    experimentFlags: snapshot.experimentFlags,
    requestDefaults: snapshot.requestDefaults,
    debugEvents: snapshot.debugEvents,
    drawerOpen: state.drawerOpen,
    byokRuntimeIssue: state.byokRuntimeIssue
  }));
  return snapshot;
};

export const syncSettingsStoreFromStorage = (
  store: ReturnType<typeof createSettingsStore> = settingsStore
): PersistedSettingsSnapshot => applySettingsSnapshotToStore(store, loadSnapshot());

export const useSettingsStore = <T>(
  selector: (state: SettingsStoreState) => T
): T => useStore(settingsStore, selector);

const buildExtraHeaders = (flags: ExperimentFlags): Record<string, string> => {
  const headers: Record<string, string> = {};
  if (flags.strictValidationEnabled) {
    headers["x-client-strict-validation"] = "1";
  }
  if (flags.fallbackSingleAgentEnabled) {
    headers["x-client-fallback-single-agent"] = "1";
  }
  if (flags.performanceSamplingEnabled) {
    headers["x-client-performance-sampling"] = "1";
  }
  return headers;
};

const getDefaultPreset = (mode: ChatMode, state: SettingsStoreState) => {
  if (mode === "byok") {
    return (
      state.byokPresets.find((item) => item.id === state.defaultByokPresetId) ??
      state.byokPresets[0]
    );
  }

  return (
    state.officialPresets.find(
      (item) => item.id === state.defaultOfficialPresetId
    ) ?? state.officialPresets[0]
  );
};

const VISION_MODEL_MARKERS = [
  "gpt-4o",
  "claude-3",
  "gemini",
  "vision",
  "vl"
] as const;

export const inferModelSupportsVision = (model?: string): boolean => {
  const normalized = (model ?? "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (/(^|[-_/])mini($|[-_/])/.test(normalized) && !normalized.includes("vision")) {
    return false;
  }

  return VISION_MODEL_MARKERS.some((marker) => normalized.includes(marker));
};

export const resolveRuntimeCapabilitiesForModel = (params: {
  runtimeTarget: RuntimeTarget;
  model?: string;
}): RuntimeCapabilities => {
  const base = runtimeCapabilitiesByTarget[params.runtimeTarget];
  return {
    ...base,
    supportsVision: base.supportsVision && inferModelSupportsVision(params.model)
  };
};

const getDefaultRuntimeProfile = (
  state: SettingsStoreState
): RuntimeProfile => {
  const preferred = state.runtimeProfiles.find(
    (item) => item.id === state.defaultRuntimeProfileId
  );
  return preferred ?? state.runtimeProfiles[0];
};

export const resolveRuntimeProfile = (): {
  profile: RuntimeProfile;
  capabilities: RuntimeCapabilities;
} => {
  const state = settingsStore.getState();
  const profile = getDefaultRuntimeProfile(state);
  const preset = getDefaultPreset(state.defaultMode, state);
  return {
    profile,
    capabilities: resolveRuntimeCapabilitiesForModel({
      runtimeTarget: profile.target,
      model: preset?.model
    })
  };
};

export const resolveCompileRuntimeOptions = async (params: {
  conversationId: string;
  mode: ChatMode;
}): Promise<CompileRuntimeOptions> => {
  const state = settingsStore.getState();
  const runtimeProfile = getDefaultRuntimeProfile(state);
  const runtimeBaseUrl = runtimeProfile.baseUrl || undefined;
  const preset = getDefaultPreset(params.mode, state);
  const session = state.sessionOverrides[params.conversationId] ?? {};
  const activeModel = session.model ?? preset.model;
  const runtimeCapabilities = resolveRuntimeCapabilitiesForModel({
    runtimeTarget: runtimeProfile.target,
    model: activeModel
  });

  let byokEndpoint: string | undefined;
  let byokKey: string | undefined;
  let byokRuntimeIssue: ByokRuntimeIssue | undefined;

  if (params.mode === "byok") {
    const byokPreset = preset as ByokPreset;
    if (runtimeProfile.target === "direct") {
      byokEndpoint = byokPreset.endpoint || runtimeBaseUrl;
    } else {
      byokEndpoint = byokPreset.endpoint || undefined;
    }
    if (byokPreset.apiKeyCipher) {
      try {
        byokKey = await browserSecretService.decrypt(byokPreset.apiKeyCipher);
        if (state.byokRuntimeIssue?.presetId === byokPreset.id) {
          settingsStore.getState().setByokRuntimeIssue(null);
        }
      } catch {
        byokRuntimeIssue = {
          code: "BYOK_KEY_DECRYPT_FAILED",
          presetId: byokPreset.id,
          presetName: byokPreset.name,
          message: "BYOK Key 解密失败，请重新填写 API Key"
        };
        settingsStore.getState().setByokRuntimeIssue(byokRuntimeIssue);
        settingsStore.getState().appendDebugEvent({
          level: "error",
          message: "BYOK Key 解密失败，已跳过本次 key 注入"
        });
      }
    }
  }

  const timeoutMs = state.experimentFlags.requestTimeoutEnabled
    ? session.timeoutMs ?? preset.timeoutMs
    : undefined;

  return {
    runtimeTarget: runtimeProfile.target,
    runtimeBaseUrl,
    runtimeCapabilities,
    model: activeModel,
    byokEndpoint,
    byokKey,
    byokRuntimeIssue,
    timeoutMs,
    retryAttempts: state.experimentFlags.autoRetryEnabled
      ? session.retryAttempts ?? state.requestDefaults.retryAttempts
      : 0,
    extraHeaders: buildExtraHeaders(state.experimentFlags)
  };
};

export const appendDebugEventIfEnabled = (event: {
  level: "info" | "error";
  message: string;
}): void => {
  const state = settingsStore.getState();
  if (!state.experimentFlags.debugLogPanelEnabled) {
    return;
  }

  state.appendDebugEvent(event);
};
