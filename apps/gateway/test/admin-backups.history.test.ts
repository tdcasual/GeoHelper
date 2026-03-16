import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server";
import { type GatewayBackupStore } from "../src/services/backup-store";
import { createMemoryBackupStore } from "../src/services/backup-store";
import {
  buildIdentity,
  createAdminBackupApp,
  createEnvelope
} from "./admin-backups.test-helpers";

type ProtectableGatewayBackupStore = GatewayBackupStore & {
  protectSnapshot: (snapshotId: string) => Promise<unknown>;
};

describe("admin backup history routes", () => {
  it("lists backup history in newest-first order without returning envelopes", async () => {
    let tick = 0;
    const timestamps = [
      "2026-03-11T16:05:00.000Z",
      "2026-03-11T16:06:00.000Z"
    ];
    const app = createAdminBackupApp({
      maxHistory: 5,
      now: () => timestamps[Math.min(tick++, timestamps.length - 1)]
    });
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
          is_protected: false,
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
          device_id: first.device_id,
          is_protected: false
        }
      ],
      build: buildIdentity
    });
  });

  it("returns one retained backup snapshot by snapshot id", async () => {
    let tick = 0;
    const timestamps = [
      "2026-03-11T16:05:00.000Z",
      "2026-03-11T16:06:00.000Z"
    ];
    const app = createAdminBackupApp({
      maxHistory: 5,
      now: () => timestamps[Math.min(tick++, timestamps.length - 1)]
    });
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
      url: `/admin/backups/history/${first.snapshot_id}`,
      headers: {
        "x-admin-token": "secret-metrics-token"
      }
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({
      backup: {
        stored_at: "2026-03-11T16:05:00.000Z",
        schema_version: first.schema_version,
        created_at: first.created_at,
        updated_at: first.updated_at,
        app_version: first.app_version,
        checksum: first.checksum,
        conversation_count: first.conversations.length,
        snapshot_id: first.snapshot_id,
        device_id: first.device_id,
        is_protected: false,
        envelope: first
      },
      build: buildIdentity
    });
  });

  it("serializes protected metadata in history and selected-snapshot responses", async () => {
    let tick = 0;
    const timestamps = [
      "2026-03-11T16:05:00.000Z",
      "2026-03-11T16:06:00.000Z",
      "2026-03-11T16:07:00.000Z"
    ];
    const backupStore = createMemoryBackupStore({
      maxHistory: 5,
      now: () => timestamps[Math.min(tick++, timestamps.length - 1)]
    }) as ProtectableGatewayBackupStore;
    const app = buildServer(
      {
        ADMIN_METRICS_TOKEN: "secret-metrics-token",
        NODE_ENV: "test",
        GEOHELPER_BUILD_SHA: buildIdentity.git_sha,
        GEOHELPER_BUILD_TIME: buildIdentity.build_time
      },
      {
        backupStore
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

    await backupStore.protectSnapshot(first.snapshot_id);

    const historyRes = await app.inject({
      method: "GET",
      url: "/admin/backups/history?limit=2",
      headers: {
        "x-admin-token": "secret-metrics-token"
      }
    });

    expect(historyRes.statusCode).toBe(200);
    expect(JSON.parse(historyRes.payload)).toEqual({
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
          base_snapshot_id: second.base_snapshot_id,
          is_protected: false
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
          device_id: first.device_id,
          is_protected: true,
          protected_at: "2026-03-11T16:07:00.000Z"
        }
      ],
      build: buildIdentity
    });

    const snapshotRes = await app.inject({
      method: "GET",
      url: `/admin/backups/history/${first.snapshot_id}`,
      headers: {
        "x-admin-token": "secret-metrics-token"
      }
    });

    expect(snapshotRes.statusCode).toBe(200);
    expect(JSON.parse(snapshotRes.payload)).toEqual({
      backup: {
        stored_at: "2026-03-11T16:05:00.000Z",
        schema_version: first.schema_version,
        created_at: first.created_at,
        updated_at: first.updated_at,
        app_version: first.app_version,
        checksum: first.checksum,
        conversation_count: first.conversations.length,
        snapshot_id: first.snapshot_id,
        device_id: first.device_id,
        is_protected: true,
        protected_at: "2026-03-11T16:07:00.000Z",
        envelope: first
      },
      build: buildIdentity
    });
  });

  it("protects and unprotects one retained snapshot through admin routes", async () => {
    let tick = 0;
    const timestamps = [
      "2026-03-11T16:05:00.000Z",
      "2026-03-11T16:06:00.000Z"
    ];
    const app = createAdminBackupApp({
      maxHistory: 5,
      maxProtected: 1,
      now: () => timestamps[Math.min(tick++, timestamps.length - 1)]
    });
    const first = createEnvelope("1");

    await app.inject({
      method: "PUT",
      url: "/admin/backups/latest",
      headers: {
        "x-admin-token": "secret-metrics-token"
      },
      payload: first
    });

    const protectRes = await app.inject({
      method: "POST",
      url: `/admin/backups/history/${first.snapshot_id}/protect`,
      headers: {
        "x-admin-token": "secret-metrics-token"
      }
    });

    expect(protectRes.statusCode).toBe(200);
    expect(JSON.parse(protectRes.payload)).toEqual({
      protection_status: "protected",
      backup: {
        stored_at: "2026-03-11T16:05:00.000Z",
        schema_version: first.schema_version,
        created_at: first.created_at,
        updated_at: first.updated_at,
        app_version: first.app_version,
        checksum: first.checksum,
        conversation_count: first.conversations.length,
        snapshot_id: first.snapshot_id,
        device_id: first.device_id,
        is_protected: true,
        protected_at: "2026-03-11T16:06:00.000Z"
      },
      build: buildIdentity
    });

    const unprotectRes = await app.inject({
      method: "DELETE",
      url: `/admin/backups/history/${first.snapshot_id}/protect`,
      headers: {
        "x-admin-token": "secret-metrics-token"
      }
    });

    expect(unprotectRes.statusCode).toBe(200);
    expect(JSON.parse(unprotectRes.payload)).toEqual({
      protection_status: "unprotected",
      backup: {
        stored_at: "2026-03-11T16:05:00.000Z",
        schema_version: first.schema_version,
        created_at: first.created_at,
        updated_at: first.updated_at,
        app_version: first.app_version,
        checksum: first.checksum,
        conversation_count: first.conversations.length,
        snapshot_id: first.snapshot_id,
        device_id: first.device_id,
        is_protected: false
      },
      build: buildIdentity
    });
  });

  it("returns 404, 409, and 403 for invalid protected snapshot route operations", async () => {
    let tick = 0;
    const timestamps = [
      "2026-03-11T16:05:00.000Z",
      "2026-03-11T16:06:00.000Z",
      "2026-03-11T16:07:00.000Z"
    ];
    const app = createAdminBackupApp({
      maxHistory: 5,
      maxProtected: 1,
      now: () => timestamps[Math.min(tick++, timestamps.length - 1)]
    });
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

    const missing = await app.inject({
      method: "POST",
      url: "/admin/backups/history/snap-missing/protect",
      headers: {
        "x-admin-token": "secret-metrics-token"
      }
    });

    expect(missing.statusCode).toBe(404);
    expect(JSON.parse(missing.payload)).toEqual({
      error: {
        code: "BACKUP_NOT_FOUND",
        message: "Backup was not found"
      }
    });

    await app.inject({
      method: "POST",
      url: `/admin/backups/history/${first.snapshot_id}/protect`,
      headers: {
        "x-admin-token": "secret-metrics-token"
      }
    });

    const full = await app.inject({
      method: "POST",
      url: `/admin/backups/history/${second.snapshot_id}/protect`,
      headers: {
        "x-admin-token": "secret-metrics-token"
      }
    });

    expect(full.statusCode).toBe(409);
    expect(JSON.parse(full.payload)).toEqual({
      protection_status: "limit_reached",
      snapshot_id: second.snapshot_id,
      protected_count: 1,
      max_protected: 1,
      build: buildIdentity
    });

    const forbidden = await app.inject({
      method: "POST",
      url: `/admin/backups/history/${second.snapshot_id}/protect`,
      headers: {
        "x-admin-token": "wrong-token"
      }
    });

    expect(forbidden.statusCode).toBe(403);
    expect(JSON.parse(forbidden.payload)).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "Admin token is invalid"
      }
    });
  });

  it("rejects invalid tokens and returns 404 when a retained snapshot is missing", async () => {
    const app = createAdminBackupApp({
      maxHistory: 5,
      now: () => "2026-03-11T16:05:00.000Z"
    });

    await app.inject({
      method: "PUT",
      url: "/admin/backups/latest",
      headers: {
        "x-admin-token": "secret-metrics-token"
      },
      payload: createEnvelope("1")
    });

    const forbidden = await app.inject({
      method: "GET",
      url: "/admin/backups/history/snap-1",
      headers: {
        "x-admin-token": "wrong-token"
      }
    });

    expect(forbidden.statusCode).toBe(403);
    expect(JSON.parse(forbidden.payload)).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "Admin token is invalid"
      }
    });

    const missing = await app.inject({
      method: "GET",
      url: "/admin/backups/history/snap-missing",
      headers: {
        "x-admin-token": "secret-metrics-token"
      }
    });

    expect(missing.statusCode).toBe(404);
    expect(JSON.parse(missing.payload)).toEqual({
      error: {
        code: "BACKUP_NOT_FOUND",
        message: "Backup was not found"
      }
    });
  });
});
