import { asObject } from "./backup-snapshot";

type PresetRecord = Record<string, unknown> & {
  id: string;
  updatedAt: number;
};

const toPresetList = (value: unknown): PresetRecord[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => asObject(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => ({
      ...item,
      id: String(item.id ?? ""),
      updatedAt:
        typeof item.updatedAt === "number" ? item.updatedAt : Date.now()
    }))
    .filter((item) => item.id.length > 0);
};

const mergeByIdAndUpdatedAt = (
  current: PresetRecord[],
  incoming: PresetRecord[]
): PresetRecord[] => {
  const merged = new Map<string, PresetRecord>();

  for (const item of current) {
    merged.set(item.id, item);
  }

  for (const item of incoming) {
    const existing = merged.get(item.id);
    if (!existing || item.updatedAt >= existing.updatedAt) {
      merged.set(item.id, item);
    }
  }

  return Array.from(merged.values()).sort((a, b) => b.updatedAt - a.updatedAt);
};

export const normalizeSettingsSnapshot = (
  value: unknown
): Record<string, unknown> | null => asObject(value);

export const mergeSettingsSnapshot = (
  currentRaw: unknown,
  incomingRaw: unknown
): Record<string, unknown> | null => {
  const current = normalizeSettingsSnapshot(currentRaw);
  const incoming = normalizeSettingsSnapshot(incomingRaw);

  if (!current && !incoming) {
    return null;
  }
  if (!current) {
    return incoming;
  }
  if (!incoming) {
    return current;
  }

  const byokPresets = mergeByIdAndUpdatedAt(
    toPresetList(current.byokPresets),
    toPresetList(incoming.byokPresets)
  );
  const officialPresets = mergeByIdAndUpdatedAt(
    toPresetList(current.officialPresets),
    toPresetList(incoming.officialPresets)
  );
  const runtimeProfiles = mergeByIdAndUpdatedAt(
    toPresetList(current.runtimeProfiles),
    toPresetList(incoming.runtimeProfiles)
  );
  const currentSessionOverrides = asObject(current.sessionOverrides) ?? {};
  const incomingSessionOverrides = asObject(incoming.sessionOverrides) ?? {};
  const currentExperimentFlags = asObject(current.experimentFlags) ?? {};
  const incomingExperimentFlags = asObject(incoming.experimentFlags) ?? {};
  const currentRequestDefaults = asObject(current.requestDefaults) ?? {};
  const incomingRequestDefaults = asObject(incoming.requestDefaults) ?? {};
  const currentDebugEvents = Array.isArray(current.debugEvents)
    ? current.debugEvents
    : [];
  const incomingDebugEvents = Array.isArray(incoming.debugEvents)
    ? incoming.debugEvents
    : [];
  const debugEvents = [...currentDebugEvents, ...incomingDebugEvents]
    .map((item) => asObject(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .sort((a, b) => (Number(b.time ?? 0) || 0) - (Number(a.time ?? 0) || 0))
    .slice(0, 100);

  const currentDefaultByokPresetId =
    typeof current.defaultByokPresetId === "string"
      ? current.defaultByokPresetId
      : undefined;
  const incomingDefaultByokPresetId =
    typeof incoming.defaultByokPresetId === "string"
      ? incoming.defaultByokPresetId
      : undefined;
  const defaultByokPresetId = [incomingDefaultByokPresetId, currentDefaultByokPresetId].find(
    (candidate) =>
      candidate && byokPresets.some((item) => item.id === candidate)
  );

  const currentDefaultOfficialPresetId =
    typeof current.defaultOfficialPresetId === "string"
      ? current.defaultOfficialPresetId
      : undefined;
  const incomingDefaultOfficialPresetId =
    typeof incoming.defaultOfficialPresetId === "string"
      ? incoming.defaultOfficialPresetId
      : undefined;
  const defaultOfficialPresetId = [
    incomingDefaultOfficialPresetId,
    currentDefaultOfficialPresetId
  ].find(
    (candidate) =>
      candidate && officialPresets.some((item) => item.id === candidate)
  );

  const currentDefaultRuntimeProfileId =
    typeof current.defaultRuntimeProfileId === "string"
      ? current.defaultRuntimeProfileId
      : undefined;
  const incomingDefaultRuntimeProfileId =
    typeof incoming.defaultRuntimeProfileId === "string"
      ? incoming.defaultRuntimeProfileId
      : undefined;
  const defaultRuntimeProfileId = [
    incomingDefaultRuntimeProfileId,
    currentDefaultRuntimeProfileId
  ].find(
    (candidate) =>
      candidate && runtimeProfiles.some((item) => item.id === candidate)
  );
  const defaultPlatformAgentProfileId =
    typeof incoming.defaultPlatformAgentProfileId === "string"
      ? incoming.defaultPlatformAgentProfileId
      : typeof current.defaultPlatformAgentProfileId === "string"
        ? current.defaultPlatformAgentProfileId
        : "platform_geometry_standard";

  return {
    ...current,
    ...incoming,
    runtimeProfiles,
    defaultRuntimeProfileId: defaultRuntimeProfileId ?? runtimeProfiles[0]?.id,
    defaultPlatformAgentProfileId,
    byokPresets,
    officialPresets,
    defaultByokPresetId: defaultByokPresetId ?? byokPresets[0]?.id,
    defaultOfficialPresetId: defaultOfficialPresetId ?? officialPresets[0]?.id,
    sessionOverrides: {
      ...currentSessionOverrides,
      ...incomingSessionOverrides
    },
    experimentFlags: {
      ...currentExperimentFlags,
      ...incomingExperimentFlags
    },
    requestDefaults: {
      ...currentRequestDefaults,
      ...incomingRequestDefaults
    },
    debugEvents
  };
};

export const mergeUiPreferences = (
  currentRaw: unknown,
  incomingRaw: unknown
): Record<string, unknown> | null => {
  const current = asObject(currentRaw);
  const incoming = asObject(incomingRaw);

  if (!current && !incoming) {
    return null;
  }
  if (!current) {
    return incoming;
  }
  if (!incoming) {
    return current;
  }

  return {
    ...current,
    ...incoming
  };
};
