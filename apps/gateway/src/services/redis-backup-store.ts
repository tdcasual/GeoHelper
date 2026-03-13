import { KvClient } from "./kv-client";
import {
  BackupStoreOptions,
  createGuardedWriteConflict,
  createMemoryBackupStore,
  GuardedGatewayBackupWriteInput,
  mergeRetainedBackupHistory,
  pruneRetainedBackupHistory,
  GatewayBackupRecord,
  GatewayBackupStore,
  GatewayBackupSummary,
  parseGatewayBackupEnvelope
} from "./backup-store";

interface RedisBackupStoreOptions extends BackupStoreOptions {
  prefix?: string;
  ttlSeconds?: number;
}

const DEFAULT_BACKUP_PREFIX = "geohelper:backup";
const DEFAULT_BACKUP_MAX_PROTECTED = 20;

const createSnapshotKey = (prefix: string, snapshotId: string): string =>
  `${prefix}:snapshot:${snapshotId}`;

const readJson = async <T>(
  kvClient: KvClient,
  key: string,
  parse: (value: unknown) => T | null
): Promise<T | null> => {
  const raw = await kvClient.get(key);
  if (!raw) {
    return null;
  }

  try {
    return parse(JSON.parse(raw));
  } catch {
    return null;
  }
};

const toSummary = (value: unknown): GatewayBackupSummary | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const summary = value as Partial<GatewayBackupSummary>;
  if (
    typeof summary.storedAt !== "string" ||
    typeof summary.checksum !== "string" ||
    typeof summary.schemaVersion !== "number" ||
    typeof summary.createdAt !== "string" ||
    typeof summary.updatedAt !== "string" ||
    typeof summary.appVersion !== "string" ||
    typeof summary.conversationCount !== "number" ||
    typeof summary.snapshotId !== "string" ||
    typeof summary.deviceId !== "string"
  ) {
    return null;
  }

  return {
    storedAt: summary.storedAt,
    checksum: summary.checksum,
    schemaVersion: summary.schemaVersion,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    appVersion: summary.appVersion,
    conversationCount: summary.conversationCount,
    snapshotId: summary.snapshotId,
    deviceId: summary.deviceId,
    isProtected: typeof summary.isProtected === "boolean" ? summary.isProtected : false,
    ...(typeof summary.protectedAt === "string"
      ? { protectedAt: summary.protectedAt }
      : {}),
    ...(typeof summary.baseSnapshotId === "string"
      ? { baseSnapshotId: summary.baseSnapshotId }
      : {})
  };
};

const toRecord = (value: unknown): GatewayBackupRecord | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const summary = toSummary(record);
  if (!summary) {
    return null;
  }

  try {
    return {
      ...summary,
      envelope: parseGatewayBackupEnvelope(record.envelope)
    };
  } catch {
    return null;
  }
};

const readHistory = async (
  kvClient: KvClient,
  key: string
): Promise<GatewayBackupSummary[]> => {
  const history = await readJson(kvClient, key, (value) => {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => toSummary(item))
      .filter((item): item is GatewayBackupSummary => item !== null);
  });

  return history ?? [];
};

const toRecordSummary = ({
  envelope: _envelope,
  ...summary
}: GatewayBackupRecord): GatewayBackupSummary => summary;

const setSummaryProtected = <T extends GatewayBackupSummary>(
  summary: T,
  protectedAt: string
): T =>
  ({
    ...summary,
    isProtected: true,
    protectedAt
  }) as T;

const setSummaryUnprotected = <T extends GatewayBackupSummary>(summary: T): T => {
  const next = {
    ...summary,
    isProtected: false
  } as T & { protectedAt?: string };
  delete next.protectedAt;
  return next;
};

const countProtectedSnapshots = (history: GatewayBackupSummary[]): number =>
  history.filter((entry) => entry.isProtected).length;

const normalizeSnapshotId = (snapshotId: string): string => snapshotId.trim();

const syncRetainedSnapshotRecord = async (
  kvClient: KvClient,
  prefix: string,
  record: GatewayBackupRecord,
  history: GatewayBackupSummary[],
  maxHistory: number
): Promise<GatewayBackupSummary[]> => {
  const nextHistory = mergeRetainedBackupHistory(
    history,
    toRecordSummary(record),
    maxHistory
  );
  const retainedSnapshotIds = new Set(nextHistory.map((entry) => entry.snapshotId));
  const prunedSnapshotIds = history
    .map((entry) => entry.snapshotId)
    .filter((snapshotId) => !retainedSnapshotIds.has(snapshotId));

  await kvClient.set(createSnapshotKey(prefix, record.snapshotId), JSON.stringify(record));

  await Promise.all(
    prunedSnapshotIds.map((snapshotId) =>
      kvClient.delete(createSnapshotKey(prefix, snapshotId))
    )
  );

  return nextHistory;
};

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

export const createRedisBackupStore = (
  kvClient: KvClient,
  options: RedisBackupStoreOptions = {}
): GatewayBackupStore => {
  const prefix = options.prefix?.trim() || DEFAULT_BACKUP_PREFIX;
  const maxHistory = Math.max(1, Math.floor(options.maxHistory ?? 10));
  const maxProtected = Math.max(
    1,
    Math.floor(options.maxProtected ?? DEFAULT_BACKUP_MAX_PROTECTED)
  );
  const now = options.now ?? (() => new Date().toISOString());
  const memoryFallback = createMemoryBackupStore(options);
  const latestKey = `${prefix}:latest`;
  const historyKey = `${prefix}:history`;

  return {
    writeLatest: async (envelopeInput) => {
      const latest = await memoryFallback.writeLatest(envelopeInput);
      const record = await memoryFallback.readLatest();
      const history = await readHistory(kvClient, historyKey);
      const nextHistory = record
        ? await syncRetainedSnapshotRecord(
            kvClient,
            prefix,
            record,
            history,
            maxHistory
          )
        : [latest, ...history].slice(0, maxHistory);

      await kvClient.set(latestKey, JSON.stringify(record));
      await kvClient.set(historyKey, JSON.stringify(nextHistory));

      return latest;
    },
    writeLatestGuarded: async (input) => {
      const latest = await readJson(kvClient, latestKey, toRecord);
      if (!doesGuardExpectationMatch(latest, input)) {
        return createGuardedWriteConflict(latest, input);
      }

      const backup = await memoryFallback.writeLatest(input.envelope);
      const record = await memoryFallback.readLatest();
      const history = await readHistory(kvClient, historyKey);
      const nextHistory = record
        ? await syncRetainedSnapshotRecord(
            kvClient,
            prefix,
            record,
            history,
            maxHistory
          )
        : [backup, ...history].slice(0, maxHistory);

      await kvClient.set(latestKey, JSON.stringify(record));
      await kvClient.set(historyKey, JSON.stringify(nextHistory));

      return {
        status: "written",
        backup
      };
    },
    readLatest: async () => readJson(kvClient, latestKey, toRecord),
    readHistory: async (limit) => {
      const history = await readHistory(kvClient, historyKey);
      const normalizedLimit =
        typeof limit === "number" ? Math.max(0, Math.floor(limit)) : maxHistory;
      return history.slice(0, normalizedLimit);
    },
    readProtectedHistory: async (limit) => {
      const history = await readHistory(kvClient, historyKey);
      const protectedHistory = history.filter((entry) => entry.isProtected);
      const normalizedLimit =
        typeof limit === "number"
          ? Math.max(0, Math.floor(limit))
          : protectedHistory.length;
      return protectedHistory.slice(0, normalizedLimit);
    },
    readSnapshot: async (snapshotId) => {
      const normalizedSnapshotId = normalizeSnapshotId(snapshotId);
      if (normalizedSnapshotId.length === 0) {
        return null;
      }

      const latest = await readJson(kvClient, latestKey, toRecord);
      if (latest?.snapshotId === normalizedSnapshotId) {
        return latest;
      }

      return readJson(
        kvClient,
        createSnapshotKey(prefix, normalizedSnapshotId),
        toRecord
      );
    },
    protectSnapshot: async (snapshotId) => {
      const normalizedSnapshotId = normalizeSnapshotId(snapshotId);
      if (normalizedSnapshotId.length === 0) {
        return {
          status: "not_found",
          snapshotId: normalizedSnapshotId
        };
      }

      const history = await readHistory(kvClient, historyKey);
      const latest = await readJson(kvClient, latestKey, toRecord);
      const existing = latest?.snapshotId === normalizedSnapshotId
        ? latest
        : await readJson(
            kvClient,
            createSnapshotKey(prefix, normalizedSnapshotId),
            toRecord
          );
      const retained = history.some(
        (entry) => entry.snapshotId === normalizedSnapshotId
      );

      if (!existing || !retained) {
        return {
          status: "not_found",
          snapshotId: normalizedSnapshotId
        };
      }

      const protectedCount = countProtectedSnapshots(history);
      if (existing.isProtected) {
        return {
          status: "protected",
          backup: toRecordSummary(existing),
          protectedCount,
          maxProtected
        };
      }

      if (protectedCount >= maxProtected) {
        return {
          status: "limit_reached",
          snapshotId: normalizedSnapshotId,
          protectedCount,
          maxProtected
        };
      }

      const protectedAt = now();
      const updatedRecord = setSummaryProtected(existing, protectedAt);
      const nextHistory = pruneRetainedBackupHistory(
        history.map((entry) =>
        entry.snapshotId === normalizedSnapshotId
          ? setSummaryProtected(entry, protectedAt)
          : entry
        ),
        maxHistory
      );

      await kvClient.set(createSnapshotKey(prefix, normalizedSnapshotId), JSON.stringify(updatedRecord));
      if (latest?.snapshotId === normalizedSnapshotId) {
        await kvClient.set(latestKey, JSON.stringify(updatedRecord));
      }
      await kvClient.set(historyKey, JSON.stringify(nextHistory));

      return {
        status: "protected",
        backup: toRecordSummary(updatedRecord),
        protectedCount: countProtectedSnapshots(nextHistory),
        maxProtected
      };
    },
    unprotectSnapshot: async (snapshotId) => {
      const normalizedSnapshotId = normalizeSnapshotId(snapshotId);
      if (normalizedSnapshotId.length === 0) {
        return {
          status: "not_found",
          snapshotId: normalizedSnapshotId
        };
      }

      const history = await readHistory(kvClient, historyKey);
      const latest = await readJson(kvClient, latestKey, toRecord);
      const existing = latest?.snapshotId === normalizedSnapshotId
        ? latest
        : await readJson(
            kvClient,
            createSnapshotKey(prefix, normalizedSnapshotId),
            toRecord
          );
      const retained = history.some(
        (entry) => entry.snapshotId === normalizedSnapshotId
      );

      if (!existing || !retained) {
        return {
          status: "not_found",
          snapshotId: normalizedSnapshotId
        };
      }

      const updatedRecord = setSummaryUnprotected(existing);
      const nextHistory = pruneRetainedBackupHistory(
        history.map((entry) =>
        entry.snapshotId === normalizedSnapshotId
          ? setSummaryUnprotected(entry)
          : entry
        ),
        maxHistory
      );
      const retainedSnapshotIds = new Set(nextHistory.map((entry) => entry.snapshotId));
      const prunedSnapshotIds = history
        .map((entry) => entry.snapshotId)
        .filter((snapshotId) => !retainedSnapshotIds.has(snapshotId));

      if (retainedSnapshotIds.has(normalizedSnapshotId)) {
        await kvClient.set(
          createSnapshotKey(prefix, normalizedSnapshotId),
          JSON.stringify(updatedRecord)
        );
      } else {
        await kvClient.delete(createSnapshotKey(prefix, normalizedSnapshotId));
      }
      if (latest?.snapshotId === normalizedSnapshotId && retainedSnapshotIds.has(normalizedSnapshotId)) {
        await kvClient.set(latestKey, JSON.stringify(updatedRecord));
      }
      await Promise.all(
        prunedSnapshotIds.map((snapshotId) =>
          kvClient.delete(createSnapshotKey(prefix, snapshotId))
        )
      );
      await kvClient.set(historyKey, JSON.stringify(nextHistory));

      return {
        status: "unprotected",
        backup: toRecordSummary(updatedRecord),
        protectedCount: countProtectedSnapshots(nextHistory),
        maxProtected
      };
    }
  };
};
