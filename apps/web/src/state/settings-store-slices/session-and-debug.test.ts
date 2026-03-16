import { describe, expect, it } from "vitest";

import { buildNextDebugEvents, buildSessionOverridePatch } from "./session-and-debug";

describe("session and debug slice", () => {
  it("clamps session override values to supported ranges", () => {
    expect(
      buildSessionOverridePatch(
        {
          temperature: 0.2,
          maxTokens: 1200,
          timeoutMs: 20000,
          retryAttempts: 1
        },
        {
          temperature: 9,
          maxTokens: 999999,
          timeoutMs: 10,
          retryAttempts: 99
        }
      )
    ).toEqual({
      temperature: 2,
      maxTokens: 32000,
      timeoutMs: 1000,
      retryAttempts: 5
    });
  });

  it("prepends debug events and enforces the limit", () => {
    const events = Array.from({ length: 100 }, (_, index) => ({
      id: `dbg_${index}`,
      time: index,
      level: "info" as const,
      message: `event-${index}`
    }));

    const next = buildNextDebugEvents(events, {
      id: "dbg_new",
      time: 999,
      level: "error",
      message: "new-event"
    });

    expect(next).toHaveLength(100);
    expect(next[0]).toMatchObject({
      id: "dbg_new",
      message: "new-event"
    });
    expect(next.at(-1)?.id).toBe("dbg_98");
  });
});
