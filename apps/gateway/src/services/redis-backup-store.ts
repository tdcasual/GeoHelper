import { KvClient } from "./kv-client";
import {
  BackupStoreOptions,
  createMemoryBackupStore,
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
const DEFAULT_BACKUP_TTL_SECONDS = 60 * 60 * 24 * 30;

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
    typeof summary.appVersion !== "string" ||
    typeof summary.conversationCount !== "number"
  ) {
    return null;
  }

  return {
    storedAt: summary.storedAt,
    checksum: summary.checksum,
    schemaVersion: summary.schemaVersion,
    createdAt: summary.createdAt,
    appVersion: summary.appVersion,
    conversationCount: summary.conversationCount
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

export const createRedisBackupStore = (
  kvClient: KvClient,
  options: RedisBackupStoreOptions = {}
): GatewayBackupStore => {
  const prefix = options.prefix?.trim() || DEFAULT_BACKUP_PREFIX;
  const ttlSeconds = Math.max(
    1,
    Math.floor(options.ttlSeconds ?? DEFAULT_BACKUP_TTL_SECONDS)
  );
  const maxHistory = Math.max(1, Math.floor(options.maxHistory ?? 10));
  const memoryFallback = createMemoryBackupStore(options);
  const latestKey = `${prefix}:latest`;
  const historyKey = `${prefix}:history`;

  return {
    writeLatest: async (envelopeInput) => {
      const latest = await memoryFallback.writeLatest(envelopeInput);
      const record = await memoryFallback.readLatest();
      const history = await readHistory(kvClient, historyKey);
      const nextHistory = [latest, ...history].slice(0, maxHistory);

      await kvClient.set(latestKey, JSON.stringify(record), {
        ttlSeconds
      });
      await kvClient.set(historyKey, JSON.stringify(nextHistory), {
        ttlSeconds
      });

      return latest;
    },
    readLatest: async () => readJson(kvClient, latestKey, toRecord),
    readHistory: async (limit) => {
      const history = await readHistory(kvClient, historyKey);
      const normalizedLimit =
        typeof limit === "number" ? Math.max(0, Math.floor(limit)) : maxHistory;
      return history.slice(0, normalizedLimit);
    }
  };
};
