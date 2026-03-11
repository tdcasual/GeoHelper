import { z } from "zod";

export const GatewayBackupEnvelopeSchema = z.object({
  schema_version: z.number().int().positive(),
  created_at: z.string().trim().min(1),
  app_version: z.string().trim().min(1),
  checksum: z.string().trim().min(1),
  conversations: z.array(z.record(z.string(), z.unknown())),
  settings: z.record(z.string(), z.unknown())
});

export type GatewayBackupEnvelope = z.infer<typeof GatewayBackupEnvelopeSchema>;

export interface GatewayBackupSummary {
  storedAt: string;
  checksum: string;
  schemaVersion: number;
  createdAt: string;
  appVersion: string;
  conversationCount: number;
}

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

const createSummary = (
  envelope: GatewayBackupEnvelope,
  storedAt: string
): GatewayBackupSummary => ({
  storedAt,
  checksum: envelope.checksum,
  schemaVersion: envelope.schema_version,
  createdAt: envelope.created_at,
  appVersion: envelope.app_version,
  conversationCount: envelope.conversations.length
});

export const parseGatewayBackupEnvelope = (
  value: unknown
): GatewayBackupEnvelope => GatewayBackupEnvelopeSchema.parse(value);

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
