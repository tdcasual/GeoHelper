import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server";

describe("GET /admin/metrics", () => {
  it("returns a runtime-oriented gateway metrics snapshot", async () => {
    const app = buildServer({
      PRESET_TOKEN: "geohelper-token",
      ADMIN_METRICS_TOKEN: "secret-admin-token",
      ALERT_WEBHOOK_URL: "https://alerts.example.com/hook",
      REDIS_URL: "redis://shared-test",
      GATEWAY_ENABLE_ATTACHMENTS: "1"
    });

    const res = await app.inject({
      method: "GET",
      url: "/admin/metrics",
      headers: {
        "x-admin-token": "secret-admin-token"
      }
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({
      started_at: expect.any(String),
      gateway: {
        official_auth_enabled: true,
        admin_token_enabled: true,
        alert_webhook_enabled: true,
        redis_enabled: true,
        backup_storage: "redis",
        session_revocation_storage: "redis",
        attachments_enabled: true,
        trace_header_name: "x-trace-id"
      }
    });
  });

  it("requires the configured admin token", async () => {
    const app = buildServer({
      ADMIN_METRICS_TOKEN: "secret-admin-token"
    });

    const forbidden = await app.inject({
      method: "GET",
      url: "/admin/metrics"
    });
    expect(forbidden.statusCode).toBe(403);

    const allowed = await app.inject({
      method: "GET",
      url: "/admin/metrics",
      headers: {
        "x-admin-token": "secret-admin-token"
      }
    });
    expect(allowed.statusCode).toBe(200);
  });
});
