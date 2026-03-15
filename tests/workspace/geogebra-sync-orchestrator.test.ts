import { describe, expect, it } from "vitest";

import { syncWithFallbacks } from "../../scripts/geogebra/lib/sync-orchestrator.mjs";

describe("syncWithFallbacks", () => {
  it("falls back to the configured fallback source when latest fails", async () => {
    const attempts: string[] = [];

    const result = await syncWithFallbacks({
      tryLatest: async () => {
        attempts.push("latest");
        throw new Error("latest failed");
      },
      tryFallback: async () => {
        attempts.push("fallback");
        return { resolvedVersion: "5.4.918.0", resolvedFrom: "fallback" };
      },
      tryLastKnownGood: async () => {
        attempts.push("last-known-good");
        return { resolvedVersion: "5.4.917.0", resolvedFrom: "last-known-good" };
      }
    });

    expect(attempts).toEqual(["latest", "fallback"]);
    expect(result.resolvedFrom).toBe("fallback");
  });
});
