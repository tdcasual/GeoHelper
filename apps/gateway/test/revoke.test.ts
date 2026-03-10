import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server";
import { createMemorySessionRevocationStore } from "../src/services/session-store";

describe("POST /api/v1/auth/token/revoke", () => {
  it("revokes session and blocks future official compile calls", async () => {
    const sessionStore = createMemorySessionRevocationStore();

    const app = buildServer(
      {
        PRESET_TOKEN: "geo-allow"
      },
      {
        sessionStore,
        requestCommandBatch: async () => ({
          version: "1.0",
          scene_id: "s1",
          transaction_id: "t1",
          commands: [],
          post_checks: [],
          explanations: []
        })
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
});
