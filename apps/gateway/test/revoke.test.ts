import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server";
import { createMemoryKvClient } from "../src/services/kv-client";
import { createRedisSessionRevocationStore } from "../src/services/redis-session-store";
import { createMemorySessionRevocationStore } from "../src/services/session-store";
import { createGeometryAgentResponder } from "./helpers/geometry-agent-stub";

describe("POST /api/v1/auth/token/revoke", () => {
  it("revokes session and blocks future official compile calls", async () => {
    const sessionStore = createMemorySessionRevocationStore();

    const app = buildServer(
      {
        PRESET_TOKEN: "geo-allow"
      },
      {
        sessionStore,
        requestCommandBatch: createGeometryAgentResponder()
      }
    );

    const loginRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/token/login",
      payload: { token: "geo-allow", device_id: "d1" }
    });
    const sessionToken = JSON.parse(loginRes.payload).session_token as string;

    const revokeRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/token/revoke",
      headers: {
        authorization: `Bearer ${sessionToken}`
      }
    });
    expect(revokeRes.statusCode).toBe(200);

    const compileRes = await app.inject({
      method: "POST",
      url: "/api/v1/chat/compile",
      headers: {
        authorization: `Bearer ${sessionToken}`
      },
      payload: {
        message: "画一个圆",
        mode: "official"
      }
    });
    expect(compileRes.statusCode).toBe(401);
  });

  it("persists revocation across server recreation with shared kv", async () => {
    const kvClient = createMemoryKvClient();
    const env = {
      PRESET_TOKEN: "geo-allow",
      APP_SECRET: "geohelper-test-secret",
      REDIS_URL: "redis://shared-test"
    };

    const firstApp = buildServer(
      env,
      {
        kvClient,
        sessionStore: createRedisSessionRevocationStore(kvClient),
        requestCommandBatch: createGeometryAgentResponder()
      }
    );

    const loginRes = await firstApp.inject({
      method: "POST",
      url: "/api/v1/auth/token/login",
      payload: { token: "geo-allow", device_id: "d1" }
    });
    const sessionToken = JSON.parse(loginRes.payload).session_token as string;

    const revokeRes = await firstApp.inject({
      method: "POST",
      url: "/api/v1/auth/token/revoke",
      headers: {
        authorization: `Bearer ${sessionToken}`
      }
    });
    expect(revokeRes.statusCode).toBe(200);

    await firstApp.close();

    const secondApp = buildServer(
      env,
      {
        kvClient,
        sessionStore: createRedisSessionRevocationStore(kvClient),
        requestCommandBatch: createGeometryAgentResponder()
      }
    );

    const compileRes = await secondApp.inject({
      method: "POST",
      url: "/api/v1/chat/compile",
      headers: {
        authorization: `Bearer ${sessionToken}`
      },
      payload: {
        message: "画一个圆",
        mode: "official"
      }
    });
    expect(compileRes.statusCode).toBe(401);
  });
});
