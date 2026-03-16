import type { EncryptedSecret } from "../services/secure-secret";
import { persistSettingsSnapshotToIndexedDb } from "../storage/indexed-sync";
import type {
  ByokPreset,
  DebugEvent,
  ExperimentFlags,
  OfficialPreset,
  RemoteBackupSyncPreferences,
  RuntimeProfile,
  SessionOverride
} from "./settings-store";

export interface PersistedSettingsSnapshot {
  schemaVersion: 3;
  defaultMode: "byok" | "official";
  runtimeProfiles: RuntimeProfile[];
  defaultRuntimeProfileId: string;
  byokPresets: ByokPreset[];
  officialPresets: OfficialPreset[];
  defaultByokPresetId: string;
  defaultOfficialPresetId: string;
  remoteBackupAdminTokenCipher?: EncryptedSecret;
  remoteBackupSyncPreferences: RemoteBackupSyncPreferences;
  sessionOverrides: Record<string, SessionOverride>;
  experimentFlags: ExperimentFlags;
  requestDefaults: {
    retryAttempts: number;
  };
  debugEvents: DebugEvent[];
}

export const SETTINGS_KEY = "geohelper.settings.snapshot";

const createId = (): string =>
  `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

const clampRetryAttempts = (value: unknown): number => {
  const numericValue =
    typeof value === "number" ? value : Number(value ?? Number.NaN);
  if (Number.isNaN(numericValue)) {
    return 1;
  }

  return Math.min(5, Math.max(0, numericValue));
};

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

const createDefaultRemoteBackupSyncPreferences =
  (): RemoteBackupSyncPreferences => ({
    mode: "off"
  });

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
  id: `byok_${createId()}`,
  name: "默认 BYOK",
  model: "gpt-4o-mini",
  endpoint: "",
  temperature: 0.2,
  maxTokens: 1200,
  timeoutMs: 20_000,
  updatedAt: Date.now()
});

const createDefaultOfficialPreset = (): OfficialPreset => ({
  id: `official_${createId()}`,
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

const createDefaultSettingsSnapshot = (): PersistedSettingsSnapshot => {
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
    remoteBackupSyncPreferences: createDefaultRemoteBackupSyncPreferences(),
    sessionOverrides: {},
    experimentFlags: defaultExperimentFlags(),
    requestDefaults: {
      retryAttempts: 1
    },
    debugEvents: []
  };
};

const normalizeSettingsSnapshot = (
  raw: Partial<PersistedSettingsSnapshot> | null | undefined
): PersistedSettingsSnapshot => {
  const fallback = createDefaultSettingsSnapshot();
  const runtimeProfiles =
    Array.isArray(raw?.runtimeProfiles) && raw.runtimeProfiles.length > 0
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
    Array.isArray(raw?.byokPresets) && raw.byokPresets.length > 0
      ? raw.byokPresets
      : fallback.byokPresets;
  const officialPresets =
    Array.isArray(raw?.officialPresets) && raw.officialPresets.length > 0
      ? raw.officialPresets
      : fallback.officialPresets;
  const defaultByokPresetId = byokPresets.some(
    (item) => item.id === raw?.defaultByokPresetId
  )
    ? String(raw?.defaultByokPresetId)
    : byokPresets[0].id;
  const defaultOfficialPresetId = officialPresets.some(
    (item) => item.id === raw?.defaultOfficialPresetId
  )
    ? String(raw?.defaultOfficialPresetId)
    : officialPresets[0].id;
  const defaultRuntimeProfileId = runtimeProfiles.some(
    (item) => item.id === raw?.defaultRuntimeProfileId
  )
    ? String(raw?.defaultRuntimeProfileId)
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
    remoteBackupSyncPreferences: {
      mode:
        raw?.remoteBackupSyncPreferences?.mode === "remind_only" ||
        raw?.remoteBackupSyncPreferences?.mode === "delayed_upload"
          ? raw.remoteBackupSyncPreferences.mode
          : "off"
    },
    sessionOverrides:
      raw?.sessionOverrides && typeof raw.sessionOverrides === "object"
        ? raw.sessionOverrides
        : {},
    experimentFlags: {
      ...defaultExperimentFlags(),
      ...(raw?.experimentFlags ?? {})
    },
    requestDefaults: {
      retryAttempts: clampRetryAttempts(raw?.requestDefaults?.retryAttempts)
    },
    debugEvents: Array.isArray(raw?.debugEvents) ? raw.debugEvents : []
  };
};

export const loadSettingsSnapshot = (): PersistedSettingsSnapshot => {
  if (!canUseStorage()) {
    return createDefaultSettingsSnapshot();
  }

  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return createDefaultSettingsSnapshot();
    }

    return normalizeSettingsSnapshot(
      JSON.parse(raw) as Partial<PersistedSettingsSnapshot>
    );
  } catch {
    return createDefaultSettingsSnapshot();
  }
};

export const saveSettingsSnapshot = (
  snapshot: PersistedSettingsSnapshot
): void => {
  if (!canUseStorage()) {
    return;
  }

  localStorage.setItem(SETTINGS_KEY, JSON.stringify(snapshot));
  void persistSettingsSnapshotToIndexedDb(
    snapshot as unknown as Record<string, unknown>
  );
};
