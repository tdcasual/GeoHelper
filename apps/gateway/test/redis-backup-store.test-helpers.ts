import { createBackupEnvelope } from "@geohelper/protocol";

import type {
  GatewayBackupEnvelope,
  GatewayBackupStore
} from "../src/services/backup-store";

export const createEnvelope = (
  id: string,
  overrides: Partial<GatewayBackupEnvelope> = {}
): GatewayBackupEnvelope =>
  createBackupEnvelope(
    {
      conversations: overrides.conversations ?? [
        {
          id: `conv-${id}`,
          title: `Conversation ${id}`
        }
      ],
      settings: overrides.settings ?? {
        defaultMode: "byok"
      }
    },
    {
      schemaVersion: overrides.schema_version ?? 2,
      createdAt: overrides.created_at ?? `2026-03-11T15:40:0${id}Z`,
      updatedAt: overrides.updated_at ?? `2026-03-11T15:44:0${id}Z`,
      appVersion: overrides.app_version ?? "0.0.1",
      snapshotId: overrides.snapshot_id ?? `snap-${id}`,
      deviceId: overrides.device_id ?? `device-${id}`,
      baseSnapshotId: overrides.base_snapshot_id
    }
  );

export type ProtectableGatewayBackupStore = GatewayBackupStore & {
  protectSnapshot: (snapshotId: string) => Promise<unknown>;
  unprotectSnapshot: (snapshotId: string) => Promise<unknown>;
  readProtectedHistory: (limit?: number) => Promise<unknown>;
};
