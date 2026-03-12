import { createBackupEnvelope } from "@geohelper/protocol";
import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server";
import { createMemoryBackupStore } from "../src/services/backup-store";

const createEnvelope = () =>
  createBackupEnvelope(
    {
      conversations: [
        {
          id: "conv-1",
          title: "Lesson 1"
        }
      ],
      settings: {
        defaultMode: "byok"
      }
    },
    {
      schemaVersion: 2,
      createdAt: "2026-03-11T16:00:00.000Z",
      appVersion: "0.0.1"
    }
  );

describe("admin backup routes", () => {
  it("stores the latest backup and returns metadata plus build identity", async () => {
    const app = buildServer(
      {
        ADMIN_METRICS_TOKEN: "secret-metrics-token",
        NODE_ENV: "test",
        GEOHELPER_BUILD_SHA: "backupsha",
        GEOHELPER_BUILD_TIME: "2026-03-11T16:04:00.000Z"
      },
      {
        backupStore: createMemoryBackupStore({
          now: () => "2026-03-11T16:05:00.000Z"
        })
      }
    );

    const envelope = createEnvelope();

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
        schema_version: 2,
        created_at: "2026-03-11T16:00:00.000Z",
        app_version: "0.0.1",
        checksum: envelope.checksum,
        conversation_count: 1
      },
      build: {
        git_sha: "backupsha",
        build_time: "2026-03-11T16:04:00.000Z",
        node_env: "test",
        redis_enabled: false,
        attachments_enabled: false
      }
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
        schema_version: 2,
        created_at: "2026-03-11T16:00:00.000Z",
        app_version: "0.0.1",
        checksum: envelope.checksum,
        conversation_count: 1,
        envelope
      },
      build: {
        git_sha: "backupsha",
        build_time: "2026-03-11T16:04:00.000Z",
        node_env: "test",
        redis_enabled: false,
        attachments_enabled: false
      }
    });
  });

  it("reuses the admin token guard for both read and write routes", async () => {
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
