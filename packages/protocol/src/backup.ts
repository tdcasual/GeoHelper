import { z } from "zod";

export const BackupPayloadSchema = z.object({
  conversations: z.array(z.record(z.string(), z.unknown())),
  settings: z.record(z.string(), z.unknown())
}).strict();

export type BackupPayload = z.infer<typeof BackupPayloadSchema>;

export const BackupEnvelopeSchema = BackupPayloadSchema.extend({
  schema_version: z.number().int().positive(),
  created_at: z.string().trim().min(1),
  updated_at: z.string().trim().min(1),
  app_version: z.string().trim().min(1),
  snapshot_id: z.string().trim().min(1),
  device_id: z.string().trim().min(1),
  base_snapshot_id: z.string().trim().min(1).optional(),
  checksum: z.string().trim().min(1)
}).strict();

export type BackupEnvelope = z.infer<typeof BackupEnvelopeSchema>;

export interface BackupInspection {
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
  appVersion: string;
  conversationCount: number;
  migrationHint: "compatible" | "older" | "newer";
  snapshotId: string;
  deviceId: string;
  baseSnapshotId: string | null;
}

export interface CreateBackupEnvelopeOptions {
  schemaVersion?: number;
  createdAt?: string;
  updatedAt?: string;
  appVersion?: string;
  snapshotId?: string;
  deviceId?: string;
  baseSnapshotId?: string;
}

export interface BackupSyncComparison {
  relation: "identical" | "local_newer" | "remote_newer" | "diverged";
  sameChecksum: boolean;
  newer: "local" | "remote" | "same";
  localSnapshotId: string;
  remoteSnapshotId: string;
  localUpdatedAt: string;
  remoteUpdatedAt: string;
}

export interface BackupComparableSummary {
  schema_version: number;
  created_at: string;
  updated_at: string;
  app_version: string;
  checksum: string;
  conversation_count: number;
  snapshot_id: string;
  device_id: string;
  base_snapshot_id?: string;
}

type BackupEnvelopeBodyWithoutChecksum = Omit<BackupEnvelope, "checksum">;
type BackupEnvelopeBodyBeforeSnapshot = Omit<BackupEnvelopeBodyWithoutChecksum, "snapshot_id">;

const checksumOf = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
};

const toEnvelopeBodyBeforeSnapshot = (
  payload: BackupPayload,
  options: CreateBackupEnvelopeOptions = {}
): BackupEnvelopeBodyBeforeSnapshot => {
  const createdAt = options.createdAt ?? new Date().toISOString();
  const updatedAt = options.updatedAt ?? createdAt;
  const deviceId = options.deviceId?.trim() || "local-device";
  const baseSnapshotId = options.baseSnapshotId?.trim() || undefined;

  return {
    schema_version: options.schemaVersion ?? 1,
    created_at: createdAt,
    updated_at: updatedAt,
    app_version: options.appVersion ?? "0.0.1",
    device_id: deviceId,
    ...(baseSnapshotId ? { base_snapshot_id: baseSnapshotId } : {}),
    conversations: payload.conversations,
    settings: payload.settings
  };
};

const normalizeEnvelopeBodyBeforeSnapshot = (
  envelope: BackupEnvelopeBodyBeforeSnapshot
): BackupEnvelopeBodyBeforeSnapshot => ({
  schema_version: envelope.schema_version,
  created_at: envelope.created_at,
  updated_at: envelope.updated_at,
  app_version: envelope.app_version,
  device_id: envelope.device_id,
  ...(envelope.base_snapshot_id ? { base_snapshot_id: envelope.base_snapshot_id } : {}),
  conversations: envelope.conversations,
  settings: envelope.settings
});

const normalizeEnvelopeBody = (
  envelope: BackupEnvelopeBodyWithoutChecksum
): BackupEnvelopeBodyWithoutChecksum => ({
  schema_version: envelope.schema_version,
  created_at: envelope.created_at,
  updated_at: envelope.updated_at,
  app_version: envelope.app_version,
  snapshot_id: envelope.snapshot_id,
  device_id: envelope.device_id,
  ...(envelope.base_snapshot_id ? { base_snapshot_id: envelope.base_snapshot_id } : {}),
  conversations: envelope.conversations,
  settings: envelope.settings
});

const computeSnapshotId = (body: BackupEnvelopeBodyBeforeSnapshot): string =>
  `snap_${checksumOf(JSON.stringify(normalizeEnvelopeBodyBeforeSnapshot(body)))}`;

const computeEnvelopeChecksum = (
  envelopeWithoutChecksum: BackupEnvelopeBodyWithoutChecksum
): string => checksumOf(JSON.stringify(normalizeEnvelopeBody(envelopeWithoutChecksum)));

export const createBackupEnvelope = (
  payloadInput: BackupPayload,
  options: CreateBackupEnvelopeOptions = {}
): BackupEnvelope => {
  const payload = BackupPayloadSchema.parse(payloadInput);
  const envelopeBeforeSnapshot = toEnvelopeBodyBeforeSnapshot(payload, options);
  const envelopeWithoutChecksum: BackupEnvelopeBodyWithoutChecksum = {
    ...envelopeBeforeSnapshot,
    snapshot_id: options.snapshotId?.trim() || computeSnapshotId(envelopeBeforeSnapshot)
  };

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
    updatedAt: envelope.updated_at,
    appVersion: envelope.app_version,
    conversationCount: envelope.conversations.length,
    migrationHint:
      envelope.schema_version === currentSchemaVersion
        ? "compatible"
        : envelope.schema_version < currentSchemaVersion
          ? "older"
          : "newer",
    snapshotId: envelope.snapshot_id,
    deviceId: envelope.device_id,
    baseSnapshotId: envelope.base_snapshot_id ?? null
  };
};

const toTimestamp = (value: string): number | null => {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
};

export const compareBackupEnvelopes = (
  localInput: BackupEnvelope,
  remoteInput: BackupEnvelope
): BackupSyncComparison => {
  const local = parseBackupEnvelope(localInput);
  const remote = parseBackupEnvelope(remoteInput);

  return compareBackupComparableSummaries(
    {
      schema_version: local.schema_version,
      created_at: local.created_at,
      updated_at: local.updated_at,
      app_version: local.app_version,
      checksum: local.checksum,
      conversation_count: local.conversations.length,
      snapshot_id: local.snapshot_id,
      device_id: local.device_id,
      ...(local.base_snapshot_id
        ? { base_snapshot_id: local.base_snapshot_id }
        : {})
    },
    {
      schema_version: remote.schema_version,
      created_at: remote.created_at,
      updated_at: remote.updated_at,
      app_version: remote.app_version,
      checksum: remote.checksum,
      conversation_count: remote.conversations.length,
      snapshot_id: remote.snapshot_id,
      device_id: remote.device_id,
      ...(remote.base_snapshot_id
        ? { base_snapshot_id: remote.base_snapshot_id }
        : {})
    }
  );
};

export const compareBackupComparableSummaries = (
  local: BackupComparableSummary,
  remote: BackupComparableSummary
): BackupSyncComparison => {
  if (local.checksum === remote.checksum) {
    return {
      relation: "identical",
      sameChecksum: true,
      newer: "same",
      localSnapshotId: local.snapshot_id,
      remoteSnapshotId: remote.snapshot_id,
      localUpdatedAt: local.updated_at,
      remoteUpdatedAt: remote.updated_at
    };
  }

  const localExtendsRemote = local.base_snapshot_id === remote.snapshot_id;
  const remoteExtendsLocal = remote.base_snapshot_id === local.snapshot_id;

  if (localExtendsRemote && !remoteExtendsLocal) {
    return {
      relation: "local_newer",
      sameChecksum: false,
      newer: "local",
      localSnapshotId: local.snapshot_id,
      remoteSnapshotId: remote.snapshot_id,
      localUpdatedAt: local.updated_at,
      remoteUpdatedAt: remote.updated_at
    };
  }

  if (remoteExtendsLocal && !localExtendsRemote) {
    return {
      relation: "remote_newer",
      sameChecksum: false,
      newer: "remote",
      localSnapshotId: local.snapshot_id,
      remoteSnapshotId: remote.snapshot_id,
      localUpdatedAt: local.updated_at,
      remoteUpdatedAt: remote.updated_at
    };
  }

  const localTimestamp = toTimestamp(local.updated_at);
  const remoteTimestamp = toTimestamp(remote.updated_at);

  if (localTimestamp !== null && remoteTimestamp !== null && localTimestamp !== remoteTimestamp) {
    return {
      relation: localTimestamp > remoteTimestamp ? "local_newer" : "remote_newer",
      sameChecksum: false,
      newer: localTimestamp > remoteTimestamp ? "local" : "remote",
      localSnapshotId: local.snapshot_id,
      remoteSnapshotId: remote.snapshot_id,
      localUpdatedAt: local.updated_at,
      remoteUpdatedAt: remote.updated_at
    };
  }

  return {
    relation: "diverged",
    sameChecksum: false,
    newer: "same",
    localSnapshotId: local.snapshot_id,
    remoteSnapshotId: remote.snapshot_id,
    localUpdatedAt: local.updated_at,
    remoteUpdatedAt: remote.updated_at
  };
};
