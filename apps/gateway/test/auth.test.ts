import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server";

describe("POST /api/v1/auth/token/login", () => {
  it("returns session token for valid preset token", async () => {
    const app = buildServer({
      PRESET_TOKEN: "geo-allow"
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/token/login",
      payload: {
        token: "geo-allow",
        device_id: "d1"
      }
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).session_token).toEqual(expect.any(String));
  });
});
