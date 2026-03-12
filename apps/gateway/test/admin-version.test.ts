import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server";

describe("GET /admin/version", () => {
  it("returns runtime identity for operators", async () => {
    const app = buildServer({
      NODE_ENV: "development",
      GEOHELPER_BUILD_SHA: "abc123def",
      GEOHELPER_BUILD_TIME: "2026-03-11T14:40:00.000Z",
      REDIS_URL: "redis://shared-test",
      GATEWAY_ENABLE_ATTACHMENTS: "1"
    });

    const res = await app.inject({
      method: "GET",
      url: "/admin/version"
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({
      git_sha: "abc123def",
      build_time: "2026-03-11T14:40:00.000Z",
      node_env: "development",
      redis_enabled: true,
      attachments_enabled: true
    });
  });

  it("defaults attachment capability to disabled", async () => {
    const app = buildServer({
      NODE_ENV: "development"
    });

    const res = await app.inject({
      method: "GET",
      url: "/admin/version"
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toMatchObject({
      attachments_enabled: false
    });
  });

  it("requires admin token when configured", async () => {
    const app = buildServer({
      ADMIN_METRICS_TOKEN: "secret-metrics-token"
    });

    const forbidden = await app.inject({
      method: "GET",
      url: "/admin/version"
    });
    expect(forbidden.statusCode).toBe(403);

    const allowed = await app.inject({
      method: "GET",
      url: "/admin/version",
      headers: {
        "x-admin-token": "secret-metrics-token"
      }
    });
    expect(allowed.statusCode).toBe(200);
  });
});
