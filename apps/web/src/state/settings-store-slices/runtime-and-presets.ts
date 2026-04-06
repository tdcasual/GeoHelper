import type { ChatMode, RuntimeTarget } from "../../runtime/types";
import type { SecretService } from "../../services/secure-secret";
import type {
  ByokPreset,
  OfficialPreset,
  RuntimeProfile,
  SettingsStoreState
} from "../settings-store";

type SettingsSet = (
  updater: (state: SettingsStoreState) => Partial<SettingsStoreState> | {}
) => void;

type SettingsGet = () => SettingsStoreState;

type PersistableSettingsState = Omit<SettingsStoreState, "drawerOpen"> & {
  drawerOpen?: boolean;
};

interface RuntimeAndPresetSliceDeps {
  set: SettingsSet;
  get: SettingsGet;
  saveState: (state: PersistableSettingsState) => void;
  secretService: SecretService;
}

export const clampNumber = (
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

export const makeId = (): string =>
  `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

export const sanitizePresetNumeric = <
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

export const createRuntimeAndPresetActions = (
  deps: RuntimeAndPresetSliceDeps
) => ({
  upsertRuntimeProfile: (input: {
    id?: string;
    name: string;
    target: RuntimeTarget;
    baseUrl: string;
  }) => {
    const id = input.id ?? `runtime_${makeId()}`;
    deps.set((state) => {
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
      deps.saveState(next);
      return {
        runtimeProfiles,
        defaultRuntimeProfileId
      };
    });

    return id;
  },
  setDefaultRuntimeProfile: (id: string) =>
    deps.set((state) => {
      if (!state.runtimeProfiles.some((item) => item.id === id)) {
        return {};
      }
      const next = {
        ...state,
        defaultRuntimeProfileId: id
      };
      deps.saveState(next);
      return {
        defaultRuntimeProfileId: id
      };
    }),
  setDefaultPlatformAgentProfile: (id: string) =>
    deps.set((state) => {
      const resolvedProfileId = id.trim();
      if (
        resolvedProfileId.length === 0 ||
        state.defaultPlatformAgentProfileId === resolvedProfileId
      ) {
        return {};
      }

      const next = {
        ...state,
        defaultPlatformAgentProfileId: resolvedProfileId
      };
      deps.saveState(next);
      return {
        defaultPlatformAgentProfileId: resolvedProfileId
      };
    }),
  setDefaultMode: (mode: ChatMode) =>
    deps.set((state) => {
      const next = {
        ...state,
        defaultMode: mode
      };
      deps.saveState(next);
      return {
        defaultMode: mode
      };
    }),
  setRemoteBackupAdminToken: async (token: string) => {
    const normalized = token.trim();
    const cipher = normalized
      ? await deps.secretService.encrypt(normalized)
      : undefined;

    deps.set((state) => {
      const next = {
        ...state,
        remoteBackupAdminTokenCipher: cipher
      };
      deps.saveState(next);
      return {
        remoteBackupAdminTokenCipher: cipher
      };
    });
  },
  readRemoteBackupAdminToken: async () => {
    const cipher = deps.get().remoteBackupAdminTokenCipher;
    if (!cipher) {
      return null;
    }

    return deps.secretService.decrypt(cipher);
  },
  clearRemoteBackupAdminToken: () =>
    deps.set((state) => {
      if (!state.remoteBackupAdminTokenCipher) {
        return {};
      }

      const next = {
        ...state,
        remoteBackupAdminTokenCipher: undefined
      };
      deps.saveState(next);
      return {
        remoteBackupAdminTokenCipher: undefined
      };
    }),
  upsertByokPreset: async (input: {
    id?: string;
    name: string;
    model: string;
    endpoint: string;
    temperature: number;
    maxTokens: number;
    timeoutMs: number;
    apiKey?: string;
  }) => {
    const keyCipher =
      input.apiKey && input.apiKey.trim()
        ? await deps.secretService.encrypt(input.apiKey.trim())
        : undefined;
    const id = input.id ?? `byok_${makeId()}`;

    deps.set((state) => {
      const shouldClearRuntimeIssue =
        Boolean(input.apiKey?.trim()) && state.byokRuntimeIssue?.presetId === id;
      const existing = state.byokPresets.find((item) => item.id === id);
      const merged = sanitizePresetNumeric<ByokPreset>({
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
      const defaultByokPresetId = state.defaultByokPresetId || byokPresets[0].id;
      const next = {
        ...state,
        byokPresets,
        defaultByokPresetId
      };
      deps.saveState(next);
      return {
        byokPresets,
        defaultByokPresetId,
        byokRuntimeIssue: shouldClearRuntimeIssue ? null : state.byokRuntimeIssue
      };
    });

    return id;
  },
  removeByokPreset: (id: string) =>
    deps.set((state) => {
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
      deps.saveState(next);
      return {
        byokPresets,
        defaultByokPresetId
      };
    }),
  setDefaultByokPreset: (id: string) =>
    deps.set((state) => {
      if (!state.byokPresets.some((item) => item.id === id)) {
        return {};
      }
      const next = {
        ...state,
        defaultByokPresetId: id
      };
      deps.saveState(next);
      return {
        defaultByokPresetId: id
      };
    }),
  upsertOfficialPreset: (input: {
    id?: string;
    name: string;
    model: string;
    temperature: number;
    maxTokens: number;
    timeoutMs: number;
  }) => {
    const id = input.id ?? `official_${makeId()}`;
    deps.set((state) => {
      const existing = state.officialPresets.find((item) => item.id === id);
      const merged = sanitizePresetNumeric<OfficialPreset>({
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
      deps.saveState(next);
      return {
        officialPresets,
        defaultOfficialPresetId
      };
    });

    return id;
  },
  removeOfficialPreset: (id: string) =>
    deps.set((state) => {
      if (state.officialPresets.length <= 1) {
        return {};
      }
      const officialPresets = state.officialPresets.filter((item) => item.id !== id);
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
      deps.saveState(next);
      return {
        officialPresets,
        defaultOfficialPresetId
      };
    }),
  setDefaultOfficialPreset: (id: string) =>
    deps.set((state) => {
      if (!state.officialPresets.some((item) => item.id === id)) {
        return {};
      }
      const next = {
        ...state,
        defaultOfficialPresetId: id
      };
      deps.saveState(next);
      return {
        defaultOfficialPresetId: id
      };
    }),
  clearStoredSecrets: async () => {
    await deps.secretService.clear();
    deps.set((state) => {
      const byokPresets = state.byokPresets.map((preset) => ({
        ...preset,
        apiKeyCipher: undefined
      }));
      const next = {
        ...state,
        byokPresets,
        remoteBackupAdminTokenCipher: undefined
      };
      deps.saveState(next);
      return {
        byokPresets,
        remoteBackupAdminTokenCipher: undefined,
        byokRuntimeIssue: null
      };
    });
  }
});
