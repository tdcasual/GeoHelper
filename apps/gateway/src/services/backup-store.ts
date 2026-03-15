import {
  BackupEnvelope,
  BackupEnvelopeSchema,
  BackupSyncComparison,
  compareBackupComparableSummaries,
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
  isProtected: boolean;
  protectedAt?: string;
  baseSnapshotId?: string;
}

export type GatewayBackupComparableSummary = Omit<
  GatewayBackupSummary,
  "storedAt" | "isProtected" | "protectedAt"
>;

export interface GatewayBackupRecord extends GatewayBackupSummary {
  envelope: GatewayBackupEnvelope;
}

export interface GuardedGatewayBackupWriteInput {
  envelope: GatewayBackupEnvelope;
  expectedRemoteSnapshotId?: string | null;
  expectedRemoteChecksum?: string | null;
}

export type GuardedGatewayBackupWriteResult =
  | {
      status: "written";
      backup: GatewayBackupSummary;
    }
  | {
      status: "conflict";
      expectedRemoteSnapshotId: string | null;
      expectedRemoteChecksum: string | null;
      actualRemote: GatewayBackupRecord | null;
      comparison: BackupSyncComparison;
    };

export type GatewayBackupProtectResult =
  | {
      status: "protected";
      backup: GatewayBackupSummary;
      protectedCount: number;
      maxProtected: number;
    }
  | {
      status: "limit_reached";
      snapshotId: string;
      protectedCount: number;
      maxProtected: number;
    }
  | {
      status: "not_found";
      snapshotId: string;
    };

export type GatewayBackupUnprotectResult =
  | {
      status: "unprotected";
      backup: GatewayBackupSummary;
      protectedCount: number;
      maxProtected: number;
    }
  | {
      status: "not_found";
      snapshotId: string;
    };

export interface GatewayBackupStore {
  writeLatest: (envelope: GatewayBackupEnvelope) => Promise<GatewayBackupSummary>;
  writeLatestGuarded: (
    input: GuardedGatewayBackupWriteInput
  ) => Promise<GuardedGatewayBackupWriteResult>;
  readLatest: () => Promise<GatewayBackupRecord | null>;
  readHistory: (limit?: number) => Promise<GatewayBackupSummary[]>;
  readProtectedHistory: (limit?: number) => Promise<GatewayBackupSummary[]>;
  readSnapshot: (snapshotId: string) => Promise<GatewayBackupRecord | null>;
  protectSnapshot: (snapshotId: string) => Promise<GatewayBackupProtectResult>;
  unprotectSnapshot: (snapshotId: string) => Promise<GatewayBackupUnprotectResult>;
}

export interface BackupStoreOptions {
  maxHistory?: number;
  maxProtected?: number;
  now?: () => string;
}

const DEFAULT_BACKUP_HISTORY = 10;
const DEFAULT_BACKUP_PROTECTED = 20;

const normalizeMaxHistory = (value?: number): number =>
  Math.max(1, Math.floor(value ?? DEFAULT_BACKUP_HISTORY));

const normalizeMaxProtected = (value?: number): number =>
  Math.max(1, Math.floor(value ?? DEFAULT_BACKUP_PROTECTED));

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

const toProtocolComparableSummary = (
  summary: GatewayBackupComparableSummary
) => ({
  schema_version: summary.schemaVersion,
  created_at: summary.createdAt,
  updated_at: summary.updatedAt,
  app_version: summary.appVersion,
  checksum: summary.checksum,
  conversation_count: summary.conversationCount,
  snapshot_id: summary.snapshotId,
  device_id: summary.deviceId,
  ...(summary.baseSnapshotId
    ? { base_snapshot_id: summary.baseSnapshotId }
    : {})
});

export const compareGatewayBackupSummaries = (
  local: GatewayBackupComparableSummary,
  remote: GatewayBackupComparableSummary
): BackupSyncComparison =>
  compareBackupComparableSummaries(
    toProtocolComparableSummary(local),
    toProtocolComparableSummary(remote)
  );

const createSummary = (
  envelope: GatewayBackupEnvelope,
  storedAt: string
): GatewayBackupSummary => ({
  storedAt,
  isProtected: false,
  ...createGatewayBackupComparableSummary(envelope)
});

const createRecord = (
  envelope: GatewayBackupEnvelope,
  storedAt: string
): GatewayBackupRecord => ({
  ...createSummary(envelope, storedAt),
  envelope
});

const toSummary = ({
  envelope: _envelope,
  ...summary
}: GatewayBackupRecord): GatewayBackupSummary => summary;

const setBackupProtected = <T extends GatewayBackupSummary>(
  backup: T,
  protectedAt: string
): T =>
  ({
    ...backup,
    isProtected: true,
    protectedAt
  }) as T;

const setBackupUnprotected = <T extends GatewayBackupSummary>(backup: T): T => {
  const next = {
    ...backup,
    isProtected: false
  } as T & { protectedAt?: string };
  delete next.protectedAt;
  return next;
};

const countProtectedBackups = (history: GatewayBackupSummary[]): number =>
  history.filter((entry) => entry.isProtected).length;

const normalizeSnapshotId = (snapshotId: string): string => snapshotId.trim();

export const pruneRetainedBackupHistory = <T extends GatewayBackupSummary>(
  history: T[],
  maxHistory: number
): T[] => {
  let ordinaryCount = 0;

  return history.filter((entry) => {
    if (entry.isProtected) {
      return true;
    }

    ordinaryCount += 1;
    return ordinaryCount <= maxHistory;
  });
};

export const mergeRetainedBackupHistory = <T extends GatewayBackupSummary>(
  history: T[],
  record: T,
  maxHistory: number
): T[] =>
  pruneRetainedBackupHistory(
    [record, ...history.filter((entry) => entry.snapshotId !== record.snapshotId)],
    maxHistory
  );

const createMissingRemoteComparison = (
  local: GatewayBackupEnvelope
): BackupSyncComparison => ({
  relation: "local_newer",
  sameChecksum: false,
  newer: "local",
  localSnapshotId: local.snapshot_id,
  remoteSnapshotId: "",
  localUpdatedAt: local.updated_at,
  remoteUpdatedAt: ""
});

const toExpectedValue = (value?: string | null): string | null => {
  if (typeof value !== "string") {
    return value ?? null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const doesGuardExpectationMatch = (
  latest: GatewayBackupRecord | null,
  input: GuardedGatewayBackupWriteInput
): boolean => {
  const expectedRemoteSnapshotId = toExpectedValue(input.expectedRemoteSnapshotId);
  const expectedRemoteChecksum = toExpectedValue(input.expectedRemoteChecksum);

  if (!latest) {
    return expectedRemoteSnapshotId === null && expectedRemoteChecksum === null;
  }

  if (expectedRemoteSnapshotId !== latest.snapshotId) {
    return false;
  }

  if (expectedRemoteChecksum !== null && expectedRemoteChecksum !== latest.checksum) {
    return false;
  }

  return true;
};

export const createGuardedWriteConflict = (
  latest: GatewayBackupRecord | null,
  input: GuardedGatewayBackupWriteInput
): GuardedGatewayBackupWriteResult => ({
  status: "conflict",
  expectedRemoteSnapshotId: toExpectedValue(input.expectedRemoteSnapshotId),
  expectedRemoteChecksum: toExpectedValue(input.expectedRemoteChecksum),
  actualRemote: latest,
  comparison: latest
    ? compareGatewayBackupSummaries(
        createGatewayBackupComparableSummary(
          parseGatewayBackupEnvelope(input.envelope)
        ),
        latest
      )
    : createMissingRemoteComparison(parseGatewayBackupEnvelope(input.envelope))
});

export const parseGatewayBackupEnvelope = (
  value: unknown
): GatewayBackupEnvelope => parseBackupEnvelope(value);

export const createMemoryBackupStore = (
  options: BackupStoreOptions = {}
): GatewayBackupStore => {
  const maxHistory = normalizeMaxHistory(options.maxHistory);
  const maxProtected = normalizeMaxProtected(options.maxProtected);
  const now = options.now ?? (() => new Date().toISOString());
  let latest: GatewayBackupRecord | null = null;
  let history: GatewayBackupRecord[] = [];

  const readRecordBySnapshotId = (snapshotId: string): GatewayBackupRecord | null => {
    if (latest?.snapshotId === snapshotId) {
      return latest;
    }

    return history.find((record) => record.snapshotId === snapshotId) ?? null;
  };

  const replaceRecord = (snapshotId: string, record: GatewayBackupRecord): void => {
    if (latest?.snapshotId === snapshotId) {
      latest = record;
    }

    history = history.map((entry) => (entry.snapshotId === snapshotId ? record : entry));
  };

  return {
    writeLatest: async (envelopeInput) => {
      const envelope = parseGatewayBackupEnvelope(envelopeInput);
      const record = createRecord(envelope, now());
      latest = record;
      history = mergeRetainedBackupHistory(history, record, maxHistory);
      return toSummary(record);
    },
    writeLatestGuarded: async (input) => {
      if (!doesGuardExpectationMatch(latest, input)) {
        return createGuardedWriteConflict(latest, input);
      }

      const envelope = parseGatewayBackupEnvelope(input.envelope);
      const record = createRecord(envelope, now());
      latest = record;
      history = mergeRetainedBackupHistory(history, record, maxHistory);

      return {
        status: "written",
        backup: toSummary(record)
      };
    },
    readLatest: async () => latest,
    readHistory: async (limit) => {
      const normalizedLimit =
        typeof limit === "number" ? Math.max(0, Math.floor(limit)) : maxHistory;
      return history.slice(0, normalizedLimit).map((record) => toSummary(record));
    },
    readProtectedHistory: async (limit) => {
      const protectedHistory = history.filter((record) => record.isProtected);
      const normalizedLimit =
        typeof limit === "number"
          ? Math.max(0, Math.floor(limit))
          : protectedHistory.length;
      return protectedHistory
        .slice(0, normalizedLimit)
        .map((record) => toSummary(record));
    },
    readSnapshot: async (snapshotId) => {
      const normalizedSnapshotId = normalizeSnapshotId(snapshotId);
      if (normalizedSnapshotId.length === 0) {
        return null;
      }

      return readRecordBySnapshotId(normalizedSnapshotId);
    },
    protectSnapshot: async (snapshotId) => {
      const normalizedSnapshotId = normalizeSnapshotId(snapshotId);
      const existing = normalizedSnapshotId
        ? readRecordBySnapshotId(normalizedSnapshotId)
        : null;
      if (!existing) {
        return {
          status: "not_found",
          snapshotId: normalizedSnapshotId
        };
      }

      const currentProtectedCount = countProtectedBackups(history);
      if (existing.isProtected) {
        return {
          status: "protected",
          backup: toSummary(existing),
          protectedCount: currentProtectedCount,
          maxProtected
        };
      }

      if (currentProtectedCount >= maxProtected) {
        return {
          status: "limit_reached",
          snapshotId: normalizedSnapshotId,
          protectedCount: currentProtectedCount,
          maxProtected
        };
      }

      const updated = setBackupProtected(existing, now());
      replaceRecord(normalizedSnapshotId, updated);
      history = pruneRetainedBackupHistory(history, maxHistory);

      return {
        status: "protected",
        backup: toSummary(updated),
        protectedCount: countProtectedBackups(history),
        maxProtected
      };
    },
    unprotectSnapshot: async (snapshotId) => {
      const normalizedSnapshotId = normalizeSnapshotId(snapshotId);
      const existing = normalizedSnapshotId
        ? readRecordBySnapshotId(normalizedSnapshotId)
        : null;
      if (!existing) {
        return {
          status: "not_found",
          snapshotId: normalizedSnapshotId
        };
      }

      const updated = setBackupUnprotected(existing);
      replaceRecord(normalizedSnapshotId, updated);
      history = pruneRetainedBackupHistory(history, maxHistory);

      return {
        status: "unprotected",
        backup: toSummary(updated),
        protectedCount: countProtectedBackups(history),
        maxProtected
      };
    }
  };
};
