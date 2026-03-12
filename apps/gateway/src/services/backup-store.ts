import {
  BackupEnvelope,
  BackupEnvelopeSchema,
  BackupSyncComparison,
  parseBackupEnvelope
} from "@geohelper/protocol";

export const GatewayBackupEnvelopeSchema = BackupEnvelopeSchema;

export type GatewayBackupEnvelope = BackupEnvelope;

export interface GatewayBackupSummary {
  storedAt: string;
  checksum: string;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
  appVersion: string;
  conversationCount: number;
  snapshotId: string;
  deviceId: string;
  baseSnapshotId?: string;
}

export type GatewayBackupComparableSummary = Omit<GatewayBackupSummary, "storedAt">;

export interface GatewayBackupRecord extends GatewayBackupSummary {
  envelope: GatewayBackupEnvelope;
}

export interface GatewayBackupStore {
  writeLatest: (envelope: GatewayBackupEnvelope) => Promise<GatewayBackupSummary>;
  readLatest: () => Promise<GatewayBackupRecord | null>;
  readHistory: (limit?: number) => Promise<GatewayBackupSummary[]>;
}

export interface BackupStoreOptions {
  maxHistory?: number;
  now?: () => string;
}

const DEFAULT_BACKUP_HISTORY = 10;

const normalizeMaxHistory = (value?: number): number =>
  Math.max(1, Math.floor(value ?? DEFAULT_BACKUP_HISTORY));

const toTimestamp = (value: string): number | null => {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
};

export const createGatewayBackupComparableSummary = (
  envelope: GatewayBackupEnvelope
): GatewayBackupComparableSummary => ({
  checksum: envelope.checksum,
  schemaVersion: envelope.schema_version,
  createdAt: envelope.created_at,
  updatedAt: envelope.updated_at,
  appVersion: envelope.app_version,
  conversationCount: envelope.conversations.length,
  snapshotId: envelope.snapshot_id,
  deviceId: envelope.device_id,
  ...(envelope.base_snapshot_id ? { baseSnapshotId: envelope.base_snapshot_id } : {})
});

export const compareGatewayBackupSummaries = (
  local: GatewayBackupComparableSummary,
  remote: GatewayBackupComparableSummary
): BackupSyncComparison => {
  if (local.checksum === remote.checksum) {
    return {
      relation: "identical",
      sameChecksum: true,
      newer: "same",
      localSnapshotId: local.snapshotId,
      remoteSnapshotId: remote.snapshotId,
      localUpdatedAt: local.updatedAt,
      remoteUpdatedAt: remote.updatedAt
    };
  }

  const localExtendsRemote = local.baseSnapshotId === remote.snapshotId;
  const remoteExtendsLocal = remote.baseSnapshotId === local.snapshotId;

  if (localExtendsRemote && !remoteExtendsLocal) {
    return {
      relation: "local_newer",
      sameChecksum: false,
      newer: "local",
      localSnapshotId: local.snapshotId,
      remoteSnapshotId: remote.snapshotId,
      localUpdatedAt: local.updatedAt,
      remoteUpdatedAt: remote.updatedAt
    };
  }

  if (remoteExtendsLocal && !localExtendsRemote) {
    return {
      relation: "remote_newer",
      sameChecksum: false,
      newer: "remote",
      localSnapshotId: local.snapshotId,
      remoteSnapshotId: remote.snapshotId,
      localUpdatedAt: local.updatedAt,
      remoteUpdatedAt: remote.updatedAt
    };
  }

  const localTimestamp = toTimestamp(local.updatedAt);
  const remoteTimestamp = toTimestamp(remote.updatedAt);

  if (localTimestamp !== null && remoteTimestamp !== null && localTimestamp !== remoteTimestamp) {
    return {
      relation: localTimestamp > remoteTimestamp ? "local_newer" : "remote_newer",
      sameChecksum: false,
      newer: localTimestamp > remoteTimestamp ? "local" : "remote",
      localSnapshotId: local.snapshotId,
      remoteSnapshotId: remote.snapshotId,
      localUpdatedAt: local.updatedAt,
      remoteUpdatedAt: remote.updatedAt
    };
  }

  return {
    relation: "diverged",
    sameChecksum: false,
    newer: "same",
    localSnapshotId: local.snapshotId,
    remoteSnapshotId: remote.snapshotId,
    localUpdatedAt: local.updatedAt,
    remoteUpdatedAt: remote.updatedAt
  };
};

const createSummary = (
  envelope: GatewayBackupEnvelope,
  storedAt: string
): GatewayBackupSummary => ({
  storedAt,
  ...createGatewayBackupComparableSummary(envelope)
});

export const parseGatewayBackupEnvelope = (
  value: unknown
): GatewayBackupEnvelope => parseBackupEnvelope(value);

export const createMemoryBackupStore = (
  options: BackupStoreOptions = {}
): GatewayBackupStore => {
  const maxHistory = normalizeMaxHistory(options.maxHistory);
  const now = options.now ?? (() => new Date().toISOString());
  let latest: GatewayBackupRecord | null = null;
  let history: GatewayBackupSummary[] = [];

  return {
    writeLatest: async (envelopeInput) => {
      const envelope = parseGatewayBackupEnvelope(envelopeInput);
      const storedAt = now();
      const summary = createSummary(envelope, storedAt);
      latest = {
        ...summary,
        envelope
      };
      history = [summary, ...history].slice(0, maxHistory);
      return summary;
    },
    readLatest: async () => latest,
    readHistory: async (limit) => {
      const normalizedLimit =
        typeof limit === "number" ? Math.max(0, Math.floor(limit)) : maxHistory;
      return history.slice(0, normalizedLimit);
    }
  };
};
