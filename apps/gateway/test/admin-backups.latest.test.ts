import { describe, expect, it } from "vitest";

import {
  buildIdentity,
  createAdminBackupApp,
  createEnvelope
} from "./admin-backups.test-helpers";

describe("admin backup latest routes", () => {
  it("stores the latest backup and returns metadata plus build identity", async () => {
    const app = createAdminBackupApp({
      now: () => "2026-03-11T16:05:00.000Z"
    });
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
        device_id: envelope.device_id,
        is_protected: false
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
        is_protected: false,
        envelope
      },
      build: buildIdentity
    });
  });

  it("rejects malformed backup envelopes", async () => {
    const app = createAdminBackupApp();
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
    const app = createAdminBackupApp();
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
