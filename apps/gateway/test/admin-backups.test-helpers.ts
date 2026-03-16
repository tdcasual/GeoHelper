import {
  type BackupEnvelope,
  createBackupEnvelope} from "@geohelper/protocol";

import { buildServer } from "../src/server";
import {
  type BackupStoreOptions,
  createMemoryBackupStore} from "../src/services/backup-store";

export const buildIdentity = {
  git_sha: "backupsha",
  build_time: "2026-03-11T16:04:00.000Z",
  node_env: "test",
  redis_enabled: false,
  attachments_enabled: false
};

export const createEnvelope = (
  id = "1",
  overrides: Partial<BackupEnvelope> = {}
) =>
  createBackupEnvelope(
    {
      conversations: overrides.conversations ?? [
        {
          id: `conv-${id}`,
          title: `Lesson ${id}`
        }
      ],
      settings: overrides.settings ?? {
        defaultMode: "byok"
      }
    },
    {
      schemaVersion: overrides.schema_version ?? 2,
      createdAt: overrides.created_at ?? `2026-03-11T16:00:0${id}.000Z`,
      updatedAt: overrides.updated_at ?? `2026-03-11T16:00:1${id}.000Z`,
      appVersion: overrides.app_version ?? "0.0.1",
      snapshotId: overrides.snapshot_id ?? `snap-${id}`,
      deviceId: overrides.device_id ?? `device-${id}`,
      baseSnapshotId: overrides.base_snapshot_id
    }
  );

export const toLocalSummary = (envelope: ReturnType<typeof createEnvelope>) => ({
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

export const createAdminBackupApp = (
  backupStoreOptions: BackupStoreOptions = {}
) =>
  buildServer(
    {
      ADMIN_METRICS_TOKEN: "secret-metrics-token",
      NODE_ENV: "test",
      GEOHELPER_BUILD_SHA: buildIdentity.git_sha,
      GEOHELPER_BUILD_TIME: buildIdentity.build_time
    },
    {
      backupStore: createMemoryBackupStore(backupStoreOptions)
    }
  );
