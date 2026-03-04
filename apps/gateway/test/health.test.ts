import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server";

describe("GET /api/v1/health", () => {
  it("returns ok", async () => {
    const app = buildServer();
    const res = await app.inject({ method: "GET", url: "/api/v1/health" });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).status).toBe("ok");
  });
});
