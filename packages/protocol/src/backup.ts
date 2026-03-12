import { z } from "zod";

export const BackupPayloadSchema = z.object({
  conversations: z.array(z.record(z.string(), z.unknown())),
  settings: z.record(z.string(), z.unknown())
}).strict();

export type BackupPayload = z.infer<typeof BackupPayloadSchema>;

export const BackupEnvelopeSchema = BackupPayloadSchema.extend({
  schema_version: z.number().int().positive(),
  created_at: z.string().trim().min(1),
  app_version: z.string().trim().min(1),
  checksum: z.string().trim().min(1)
}).strict();

export type BackupEnvelope = z.infer<typeof BackupEnvelopeSchema>;

export interface BackupInspection {
  schemaVersion: number;
  createdAt: string;
  appVersion: string;
  conversationCount: number;
  migrationHint: "compatible" | "older" | "newer";
}

export interface CreateBackupEnvelopeOptions {
  schemaVersion?: number;
  createdAt?: string;
  appVersion?: string;
}

const checksumOf = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
};

const toEnvelopeBody = (
  payload: BackupPayload,
  options: CreateBackupEnvelopeOptions = {}
) => ({
  schema_version: options.schemaVersion ?? 1,
  created_at: options.createdAt ?? new Date().toISOString(),
  app_version: options.appVersion ?? "0.0.1",
  conversations: payload.conversations,
  settings: payload.settings
});

const normalizeEnvelopeBody = (
  envelope: Omit<BackupEnvelope, "checksum">
): Omit<BackupEnvelope, "checksum"> => ({
  schema_version: envelope.schema_version,
  created_at: envelope.created_at,
  app_version: envelope.app_version,
  conversations: envelope.conversations,
  settings: envelope.settings
});

const computeEnvelopeChecksum = (
  envelopeWithoutChecksum: Omit<BackupEnvelope, "checksum">
): string => checksumOf(JSON.stringify(normalizeEnvelopeBody(envelopeWithoutChecksum)));

export const createBackupEnvelope = (
  payloadInput: BackupPayload,
  options: CreateBackupEnvelopeOptions = {}
): BackupEnvelope => {
  const payload = BackupPayloadSchema.parse(payloadInput);
  const envelopeWithoutChecksum = toEnvelopeBody(payload, options);

  return {
    ...envelopeWithoutChecksum,
    checksum: computeEnvelopeChecksum(envelopeWithoutChecksum)
  };
};

export const createBackupBlob = (envelopeInput: BackupEnvelope): Blob => {
  const envelope = BackupEnvelopeSchema.parse(envelopeInput);
  return new Blob([JSON.stringify(envelope, null, 2)], {
    type: "application/json"
  });
};

export const parseBackupEnvelope = (value: unknown): BackupEnvelope => {
  const envelope = BackupEnvelopeSchema.parse(value);
  const { checksum, ...rest } = envelope;
  const expectedChecksum = computeEnvelopeChecksum(rest);

  if (checksum !== expectedChecksum) {
    throw new Error("CHECKSUM_MISMATCH");
  }

  return envelope;
};

export const inspectBackupEnvelope = (
  envelopeInput: BackupEnvelope,
  currentSchemaVersion: number
): BackupInspection => {
  const envelope = parseBackupEnvelope(envelopeInput);

  return {
    schemaVersion: envelope.schema_version,
    createdAt: envelope.created_at,
    appVersion: envelope.app_version,
    conversationCount: envelope.conversations.length,
    migrationHint:
      envelope.schema_version === currentSchemaVersion
        ? "compatible"
        : envelope.schema_version < currentSchemaVersion
          ? "older"
          : "newer"
  };
};
