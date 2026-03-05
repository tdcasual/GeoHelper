import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";

import { ChatMode } from "../services/api-client";
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

interface RequestDefaults {
  retryAttempts: number;
}

interface PersistedSettingsSnapshot {
  schemaVersion: 2;
  defaultMode: ChatMode;
  byokPresets: ByokPreset[];
  officialPresets: OfficialPreset[];
  defaultByokPresetId: string;
  defaultOfficialPresetId: string;
  sessionOverrides: Record<string, SessionOverride>;
  experimentFlags: ExperimentFlags;
  requestDefaults: RequestDefaults;
  debugEvents: DebugEvent[];
}

export interface SettingsStoreState extends PersistedSettingsSnapshot {
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  setDefaultMode: (mode: ChatMode) => void;
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
  model?: string;
  byokEndpoint?: string;
  byokKey?: string;
  timeoutMs?: number;
  retryAttempts: number;
  extraHeaders: Record<string, string>;
}

interface SettingsStoreDeps {
  secretService: SecretService;
}

const SETTINGS_KEY = "geohelper.settings.snapshot";
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

const makeDefaultSnapshot = (): PersistedSettingsSnapshot => {
  const byok = createDefaultByokPreset();
  const official = createDefaultOfficialPreset();
  return {
    schemaVersion: 2,
    defaultMode: "byok",
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
};

const normalizeSnapshot = (
  raw: Partial<PersistedSettingsSnapshot> | null | undefined
): PersistedSettingsSnapshot => {
  const fallback = makeDefaultSnapshot();
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

  return {
    schemaVersion: 2,
    defaultMode: raw?.defaultMode === "official" ? "official" : "byok",
    byokPresets,
    officialPresets,
    defaultByokPresetId,
    defaultOfficialPresetId,
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
      schemaVersion: 2,
      defaultMode: state.defaultMode,
      byokPresets: state.byokPresets,
      officialPresets: state.officialPresets,
      defaultByokPresetId: state.defaultByokPresetId,
      defaultOfficialPresetId: state.defaultOfficialPresetId,
      sessionOverrides: state.sessionOverrides,
      experimentFlags: state.experimentFlags,
      requestDefaults: state.requestDefaults,
      debugEvents: state.debugEvents
    });
  };

  return createStore<SettingsStoreState>((set, get) => ({
    ...initial,
    drawerOpen: false,
    setDrawerOpen: (open) =>
      set(() => ({
        drawerOpen: open
      })),
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
    upsertByokPreset: async (input) => {
      const keyCipher =
        input.apiKey && input.apiKey.trim()
          ? await deps.secretService.encrypt(input.apiKey.trim())
          : undefined;
      const id = input.id ?? `byok_${makeId()}`;

      set((state) => {
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
          defaultByokPresetId
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
          byokPresets
        };
        saveState(next);
        return {
          byokPresets
        };
      });
    }
  }));
};

export const settingsStore = createSettingsStore();

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

export const resolveCompileRuntimeOptions = async (params: {
  conversationId: string;
  mode: ChatMode;
}): Promise<CompileRuntimeOptions> => {
  const state = settingsStore.getState();
  const preset = getDefaultPreset(params.mode, state);
  const session = state.sessionOverrides[params.conversationId] ?? {};

  let byokEndpoint: string | undefined;
  let byokKey: string | undefined;

  if (params.mode === "byok") {
    const byokPreset = preset as ByokPreset;
    byokEndpoint = byokPreset.endpoint || undefined;
    if (byokPreset.apiKeyCipher) {
      try {
        byokKey = await browserSecretService.decrypt(byokPreset.apiKeyCipher);
      } catch {
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
    model: session.model ?? preset.model,
    byokEndpoint,
    byokKey,
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
