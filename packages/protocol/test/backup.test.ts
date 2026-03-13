import { describe, expect, it } from "vitest";

import {
  BackupEnvelopeSchema,
  compareBackupComparableSummaries,
  compareBackupEnvelopes,
  createBackupEnvelope,
  inspectBackupEnvelope,
  parseBackupEnvelope
} from "../src/backup";

describe("backup protocol", () => {
  it("creates a checksum-bearing envelope from payload with sync metadata", () => {
    const envelope = createBackupEnvelope(
      {
        conversations: [{ id: "conv_1", title: "Lesson" }],
        settings: {
          defaultMode: "byok"
        }
      },
      {
        schemaVersion: 2,
        createdAt: "2026-03-12T00:30:00.000Z",
        updatedAt: "2026-03-12T00:35:00.000Z",
        appVersion: "0.0.1",
        snapshotId: "snap_1",
        deviceId: "device_a"
      }
    );

    expect(envelope).toEqual({
      schema_version: 2,
      created_at: "2026-03-12T00:30:00.000Z",
      updated_at: "2026-03-12T00:35:00.000Z",
      app_version: "0.0.1",
      snapshot_id: "snap_1",
      device_id: "device_a",
      checksum: expect.any(String),
      conversations: [{ id: "conv_1", title: "Lesson" }],
      settings: {
        defaultMode: "byok"
      }
    });
    expect(envelope.checksum.length).toBeGreaterThan(0);
  });

  it("parses and validates a stored envelope", () => {
    const envelope = createBackupEnvelope(
      {
        conversations: [{ id: "conv_1" }],
        settings: {}
      },
      {
        schemaVersion: 2,
        createdAt: "2026-03-12T00:31:00.000Z",
        updatedAt: "2026-03-12T00:31:30.000Z",
        appVersion: "0.0.1",
        snapshotId: "snap_2",
        deviceId: "device_a"
      }
    );

    expect(parseBackupEnvelope(envelope)).toEqual(envelope);
    expect(() =>
      parseBackupEnvelope({
        ...envelope,
        checksum: "broken"
      })
    ).toThrow("CHECKSUM_MISMATCH");
    expect(BackupEnvelopeSchema.safeParse({ invalid: true }).success).toBe(false);
  });

  it("inspects envelope metadata against a local schema version", () => {
    const envelope = createBackupEnvelope(
      {
        conversations: [{ id: "conv_1" }, { id: "conv_2" }],
        settings: {}
      },
      {
        schemaVersion: 2,
        createdAt: "2026-03-12T00:32:00.000Z",
        updatedAt: "2026-03-12T00:33:00.000Z",
        appVersion: "0.0.1",
        snapshotId: "snap_3",
        deviceId: "device_b",
        baseSnapshotId: "snap_2"
      }
    );

    expect(inspectBackupEnvelope(envelope, 2)).toEqual({
      schemaVersion: 2,
      createdAt: "2026-03-12T00:32:00.000Z",
      updatedAt: "2026-03-12T00:33:00.000Z",
      appVersion: "0.0.1",
      conversationCount: 2,
      migrationHint: "compatible",
      snapshotId: "snap_3",
      deviceId: "device_b",
      baseSnapshotId: "snap_2"
    });
    expect(inspectBackupEnvelope(envelope, 3).migrationHint).toBe("older");
  });

  it("compares local and remote envelopes for lightweight sync", () => {
    const remote = createBackupEnvelope(
      {
        conversations: [{ id: "conv_1" }],
        settings: {}
      },
      {
        schemaVersion: 2,
        createdAt: "2026-03-12T00:32:00.000Z",
        updatedAt: "2026-03-12T00:33:00.000Z",
        appVersion: "0.0.1",
        snapshotId: "snap_remote",
        deviceId: "device_a"
      }
    );
    const local = createBackupEnvelope(
      {
        conversations: [{ id: "conv_1" }, { id: "conv_2" }],
        settings: {}
      },
      {
        schemaVersion: 2,
        createdAt: "2026-03-12T00:32:00.000Z",
        updatedAt: "2026-03-12T00:40:00.000Z",
        appVersion: "0.0.1",
        snapshotId: "snap_local",
        deviceId: "device_a",
        baseSnapshotId: "snap_remote"
      }
    );

    expect(compareBackupEnvelopes(local, remote)).toEqual({
      relation: "local_newer",
      sameChecksum: false,
      newer: "local",
      localSnapshotId: "snap_local",
      remoteSnapshotId: "snap_remote",
      localUpdatedAt: "2026-03-12T00:40:00.000Z",
      remoteUpdatedAt: "2026-03-12T00:33:00.000Z"
    });
  });

  it("compares local and remote comparable summaries without full envelopes", () => {
    expect(
      compareBackupComparableSummaries(
        {
          schema_version: 2,
          created_at: "2026-03-12T00:32:00.000Z",
          updated_at: "2026-03-12T00:40:00.000Z",
          app_version: "0.0.1",
          checksum: "same-checksum",
          conversation_count: 2,
          snapshot_id: "snap-local-same",
          device_id: "device-a"
        },
        {
          schema_version: 2,
          created_at: "2026-03-12T00:32:00.000Z",
          updated_at: "2026-03-12T00:35:00.000Z",
          app_version: "0.0.1",
          checksum: "same-checksum",
          conversation_count: 2,
          snapshot_id: "snap-remote-same",
          device_id: "device-b"
        }
      )
    ).toEqual({
      relation: "identical",
      sameChecksum: true,
      newer: "same",
      localSnapshotId: "snap-local-same",
      remoteSnapshotId: "snap-remote-same",
      localUpdatedAt: "2026-03-12T00:40:00.000Z",
      remoteUpdatedAt: "2026-03-12T00:35:00.000Z"
    });

    expect(
      compareBackupComparableSummaries(
        {
          schema_version: 2,
          created_at: "2026-03-12T00:32:00.000Z",
          updated_at: "2026-03-12T00:40:00.000Z",
          app_version: "0.0.1",
          checksum: "checksum-local",
          conversation_count: 3,
          snapshot_id: "snap-local-newer",
          device_id: "device-a",
          base_snapshot_id: "snap-remote-base"
        },
        {
          schema_version: 2,
          created_at: "2026-03-12T00:32:00.000Z",
          updated_at: "2026-03-12T00:35:00.000Z",
          app_version: "0.0.1",
          checksum: "checksum-remote",
          conversation_count: 2,
          snapshot_id: "snap-remote-base",
          device_id: "device-b"
        }
      ).relation
    ).toBe("local_newer");

    expect(
      compareBackupComparableSummaries(
        {
          schema_version: 2,
          created_at: "2026-03-12T00:32:00.000Z",
          updated_at: "2026-03-12T00:35:00.000Z",
          app_version: "0.0.1",
          checksum: "checksum-local-old",
          conversation_count: 2,
          snapshot_id: "snap-local-base",
          device_id: "device-a"
        },
        {
          schema_version: 2,
          created_at: "2026-03-12T00:32:00.000Z",
          updated_at: "2026-03-12T00:40:00.000Z",
          app_version: "0.0.1",
          checksum: "checksum-remote-new",
          conversation_count: 3,
          snapshot_id: "snap-remote-newer",
          device_id: "device-b",
          base_snapshot_id: "snap-local-base"
        }
      ).relation
    ).toBe("remote_newer");

    expect(
      compareBackupComparableSummaries(
        {
          schema_version: 2,
          created_at: "2026-03-12T00:32:00.000Z",
          updated_at: "2026-03-12T00:36:00.000Z",
          app_version: "0.0.1",
          checksum: "checksum-local-ts",
          conversation_count: 2,
          snapshot_id: "snap-local-ts",
          device_id: "device-a"
        },
        {
          schema_version: 2,
          created_at: "2026-03-12T00:32:00.000Z",
          updated_at: "2026-03-12T00:36:00.000Z",
          app_version: "0.0.1",
          checksum: "checksum-remote-diverged",
          conversation_count: 2,
          snapshot_id: "snap-remote-diverged",
          device_id: "device-b"
        }
      ).relation
    ).toBe("diverged");
  });
});
