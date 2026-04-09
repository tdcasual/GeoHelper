import { getRuntimeGatewayBaseUrl } from "../state/runtime-profiles";
import type {
  RemoteBackupSyncMode,
  RemoteBackupSyncResultInput
} from "../state/settings-store";
import { settingsStore } from "../state/settings-store";
import type { BackupEnvelope } from "./backup";

export interface RemoteSyncReadyConfig {
  mode: RemoteBackupSyncMode;
  baseUrl: string;
  adminToken: string;
}

interface RemoteSyncReadinessDeps {
  getSyncMode: () => RemoteBackupSyncMode;
  getGatewayBaseUrl: () => string | null;
  readAdminToken: () => Promise<string | null>;
}

export const getDefaultGatewayBaseUrl = (): string | null => {
  const state = settingsStore.getState();
  const preferred = state.runtimeProfiles.find(
    (profile) =>
      profile.id === state.defaultRuntimeProfileId &&
      profile.target === "gateway" &&
      getRuntimeGatewayBaseUrl(profile).length > 0
  );
  if (preferred) {
    return getRuntimeGatewayBaseUrl(preferred);
  }

  const fallback = state.runtimeProfiles.find(
    (profile) =>
      profile.target === "gateway" && getRuntimeGatewayBaseUrl(profile).length > 0
  );
  return fallback ? getRuntimeGatewayBaseUrl(fallback) : null;
};

export const toComparableSummary = (
  envelope: Pick<
    BackupEnvelope,
    | "schema_version"
    | "created_at"
    | "updated_at"
    | "app_version"
    | "checksum"
    | "snapshot_id"
    | "device_id"
    | "base_snapshot_id"
    | "conversations"
  >
): RemoteBackupSyncResultInput["comparison"]["local_snapshot"]["summary"] => ({
  schema_version: envelope.schema_version,
  created_at: envelope.created_at,
  updated_at: envelope.updated_at,
  app_version: envelope.app_version,
  checksum: envelope.checksum,
  conversation_count: envelope.conversations.length,
  snapshot_id: envelope.snapshot_id,
  device_id: envelope.device_id,
  ...(envelope.base_snapshot_id
    ? { base_snapshot_id: envelope.base_snapshot_id }
    : {})
});

export const readRemoteSyncReadyConfig = async (
  deps: RemoteSyncReadinessDeps,
  requiredMode?: RemoteBackupSyncMode
): Promise<RemoteSyncReadyConfig | null> => {
  const mode = deps.getSyncMode();
  if (mode === "off") {
    return null;
  }
  if (requiredMode && mode !== requiredMode) {
    return null;
  }

  const baseUrl = deps.getGatewayBaseUrl()?.trim();
  if (!baseUrl) {
    return null;
  }

  const adminToken = await deps.readAdminToken();
  if (!adminToken) {
    return null;
  }

  return {
    mode,
    baseUrl,
    adminToken
  };
};
