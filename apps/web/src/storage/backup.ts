import { STORAGE_SCHEMA_VERSION } from "./migrate";

export interface BackupPayload {
  conversations: Array<Record<string, unknown>>;
  settings: Record<string, unknown>;
}

interface BackupEnvelope extends BackupPayload {
  schema_version: number;
  created_at: string;
  app_version: string;
  checksum: string;
}

const checksumOf = (value: string): string => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
};

export const exportBackup = async (payload: BackupPayload): Promise<Blob> => {
  const envelopeWithoutChecksum = {
    schema_version: STORAGE_SCHEMA_VERSION,
    created_at: new Date().toISOString(),
    app_version: "0.0.1",
    conversations: payload.conversations,
    settings: payload.settings
  };
  const body = JSON.stringify(envelopeWithoutChecksum);
  const envelope: BackupEnvelope = {
    ...envelopeWithoutChecksum,
    checksum: checksumOf(body)
  };

  return new Blob([JSON.stringify(envelope, null, 2)], {
    type: "application/json"
  });
};

export const importBackup = async (blob: Blob): Promise<BackupEnvelope> => {
  const text = await blob.text();
  const envelope = JSON.parse(text) as BackupEnvelope;
  const { checksum, ...rest } = envelope;
  const expectedChecksum = checksumOf(JSON.stringify(rest));

  if (checksum !== expectedChecksum) {
    throw new Error("CHECKSUM_MISMATCH");
  }

  return envelope;
};
