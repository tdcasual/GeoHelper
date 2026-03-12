import {
  type BackupEnvelope,
  createBackupEnvelope
} from "@geohelper/protocol";
import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server";
import { createMemoryBackupStore } from "../src/services/backup-store";

const buildIdentity = {
  git_sha: "backupsha",
  build_time: "2026-03-11T16:04:00.000Z",
  node_env: "test",
  redis_enabled: false,
  attachments_enabled: false
};

const createEnvelope = (
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

const toLocalSummary = (envelope: ReturnType<typeof createEnvelope>) => ({
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

describe("admin backup routes", () => {
  it("stores the latest backup and returns metadata plus build identity", async () => {
    const app = buildServer(
      {
        ADMIN_METRICS_TOKEN: "secret-metrics-token",
        NODE_ENV: "test",
        GEOHELPER_BUILD_SHA: buildIdentity.git_sha,
        GEOHELPER_BUILD_TIME: buildIdentity.build_time
      },
      {
        backupStore: createMemoryBackupStore({
          now: () => "2026-03-11T16:05:00.000Z"
        })
      }
    );

    const envelope = createEnvelope("1", {
      created_at: "2026-03-11T16:00:00.000Z",
      updated_at: "2026-03-11T16:00:00.000Z",
      snapshot_id: "snap-1",
      device_id: "device-1"
    });

    const putRes = await app.inject({
      method: "PUT",
      url: "/admin/backups/latest",
      headers: {
        "x-admin-token": "secret-metrics-token"
      },
      payload: envelope
    });

    expect(putRes.statusCode).toBe(200);
    expect(JSON.parse(putRes.payload)).toEqual({
      backup: {
        stored_at: "2026-03-11T16:05:00.000Z",
        schema_version: envelope.schema_version,
        created_at: envelope.created_at,
        updated_at: envelope.updated_at,
        app_version: envelope.app_version,
        checksum: envelope.checksum,
        conversation_count: envelope.conversations.length,
        snapshot_id: envelope.snapshot_id,
        device_id: envelope.device_id
      },
      build: buildIdentity
    });

    const getRes = await app.inject({
      method: "GET",
      url: "/admin/backups/latest",
      headers: {
        "x-admin-token": "secret-metrics-token"
      }
    });

    expect(getRes.statusCode).toBe(200);
    expect(JSON.parse(getRes.payload)).toEqual({
      backup: {
        stored_at: "2026-03-11T16:05:00.000Z",
        schema_version: envelope.schema_version,
        created_at: envelope.created_at,
        updated_at: envelope.updated_at,
        app_version: envelope.app_version,
        checksum: envelope.checksum,
        conversation_count: envelope.conversations.length,
        snapshot_id: envelope.snapshot_id,
        device_id: envelope.device_id,
        envelope
      },
      build: buildIdentity
    });
  });

  it("lists backup history in newest-first order without returning envelopes", async () => {
    let tick = 0;
    const timestamps = [
      "2026-03-11T16:05:00.000Z",
      "2026-03-11T16:06:00.000Z"
    ];
    const app = buildServer(
      {
        ADMIN_METRICS_TOKEN: "secret-metrics-token",
        NODE_ENV: "test",
        GEOHELPER_BUILD_SHA: buildIdentity.git_sha,
        GEOHELPER_BUILD_TIME: buildIdentity.build_time
      },
      {
        backupStore: createMemoryBackupStore({
          maxHistory: 5,
          now: () => timestamps[Math.min(tick++, timestamps.length - 1)]
        })
      }
    );

    const first = createEnvelope("1");
    const second = createEnvelope("2", {
      base_snapshot_id: first.snapshot_id
    });

    await app.inject({
      method: "PUT",
      url: "/admin/backups/latest",
      headers: {
        "x-admin-token": "secret-metrics-token"
      },
      payload: first
    });
    await app.inject({
      method: "PUT",
      url: "/admin/backups/latest",
      headers: {
        "x-admin-token": "secret-metrics-token"
      },
      payload: second
    });

    const res = await app.inject({
      method: "GET",
      url: "/admin/backups/history?limit=2",
      headers: {
        "x-admin-token": "secret-metrics-token"
      }
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({
      history: [
        {
          stored_at: "2026-03-11T16:06:00.000Z",
          schema_version: second.schema_version,
          created_at: second.created_at,
          updated_at: second.updated_at,
          app_version: second.app_version,
          checksum: second.checksum,
          conversation_count: second.conversations.length,
          snapshot_id: second.snapshot_id,
          device_id: second.device_id,
          base_snapshot_id: second.base_snapshot_id
        },
        {
          stored_at: "2026-03-11T16:05:00.000Z",
          schema_version: first.schema_version,
          created_at: first.created_at,
          updated_at: first.updated_at,
          app_version: first.app_version,
          checksum: first.checksum,
          conversation_count: first.conversations.length,
          snapshot_id: first.snapshot_id,
          device_id: first.device_id
        }
      ],
      build: buildIdentity
    });
  });

  it("compares a local summary against the latest remote snapshot using metadata only", async () => {
    let tick = 0;
    const timestamps = [
      "2026-03-11T16:05:00.000Z",
      "2026-03-11T16:06:00.000Z"
    ];
    const app = buildServer(
      {
        ADMIN_METRICS_TOKEN: "secret-metrics-token",
        NODE_ENV: "test",
        GEOHELPER_BUILD_SHA: buildIdentity.git_sha,
        GEOHELPER_BUILD_TIME: buildIdentity.build_time
      },
      {
        backupStore: createMemoryBackupStore({
          maxHistory: 5,
          now: () => timestamps[Math.min(tick++, timestamps.length - 1)]
        })
      }
    );

    const local = createEnvelope("1");
    const remote = createEnvelope("2", {
      base_snapshot_id: local.snapshot_id
    });

    await app.inject({
      method: "PUT",
      url: "/admin/backups/latest",
      headers: {
        "x-admin-token": "secret-metrics-token"
      },
      payload: local
    });
    await app.inject({
      method: "PUT",
      url: "/admin/backups/latest",
      headers: {
        "x-admin-token": "secret-metrics-token"
      },
      payload: remote
    });

    const res = await app.inject({
      method: "POST",
      url: "/admin/backups/compare",
      headers: {
        "x-admin-token": "secret-metrics-token"
      },
      payload: {
        local_summary: toLocalSummary(local)
      }
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({
      local_status: "summary",
      remote_status: "available",
      comparison_result: "remote_newer",
      local_snapshot: {
        summary: toLocalSummary(local)
      },
      remote_snapshot: {
        summary: {
          stored_at: "2026-03-11T16:06:00.000Z",
          schema_version: remote.schema_version,
          created_at: remote.created_at,
          updated_at: remote.updated_at,
          app_version: remote.app_version,
          checksum: remote.checksum,
          conversation_count: remote.conversations.length,
          snapshot_id: remote.snapshot_id,
          device_id: remote.device_id,
          base_snapshot_id: remote.base_snapshot_id
        }
      },
      build: buildIdentity
    });
  });

  it("reuses the admin token guard for latest, history, and compare routes", async () => {
    const app = buildServer({
      ADMIN_METRICS_TOKEN: "secret-metrics-token"
    });

    const forbiddenPut = await app.inject({
      method: "PUT",
      url: "/admin/backups/latest",
      payload: createEnvelope()
    });
    expect(forbiddenPut.statusCode).toBe(403);

    const forbiddenGet = await app.inject({
      method: "GET",
      url: "/admin/backups/latest"
    });
    expect(forbiddenGet.statusCode).toBe(403);

    const forbiddenHistory = await app.inject({
      method: "GET",
      url: "/admin/backups/history"
    });
    expect(forbiddenHistory.statusCode).toBe(403);

    const forbiddenCompare = await app.inject({
      method: "POST",
      url: "/admin/backups/compare",
      payload: {
        local_summary: toLocalSummary(createEnvelope())
      }
    });
    expect(forbiddenCompare.statusCode).toBe(403);
  });

  it("rejects malformed backup envelopes", async () => {
    const app = buildServer({
      ADMIN_METRICS_TOKEN: "secret-metrics-token"
    });

    const res = await app.inject({
      method: "PUT",
      url: "/admin/backups/latest",
      headers: {
        "x-admin-token": "secret-metrics-token"
      },
      payload: {
        schema_version: 2,
        created_at: "2026-03-11T16:00:00.000Z",
        app_version: "0.0.1",
        conversations: [],
        settings: {}
      }
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload)).toEqual({
      error: {
        code: "INVALID_BACKUP_ENVELOPE",
        message: "Backup envelope is invalid"
      }
    });
  });

  it("returns 404 when no latest backup has been stored", async () => {
    const app = buildServer({
      ADMIN_METRICS_TOKEN: "secret-metrics-token"
    });

    const res = await app.inject({
      method: "GET",
      url: "/admin/backups/latest",
      headers: {
        "x-admin-token": "secret-metrics-token"
      }
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.payload)).toEqual({
      error: {
        code: "BACKUP_NOT_FOUND",
        message: "Backup was not found"
      }
    });
  });
});
