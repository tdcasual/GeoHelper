import { describe, expect, it } from "vitest";

import { clampNumber, sanitizePresetNumeric } from "./runtime-and-presets";

describe("runtime and preset slice", () => {
  it("clamps numeric values to supported ranges", () => {
    expect(
      clampNumber(Number.NaN, {
        min: 0,
        max: 2,
        fallback: 0.2
      })
    ).toBe(0.2);
    expect(
      clampNumber(99, {
        min: 0,
        max: 2,
        fallback: 0.2
      })
    ).toBe(2);
  });

  it("sanitizes preset numeric settings", () => {
    expect(
      sanitizePresetNumeric({
        id: "byok_1",
        name: "Preset",
        model: "gpt-4o-mini",
        endpoint: "https://example.com",
        temperature: 9,
        maxTokens: 999999,
        timeoutMs: 10,
        updatedAt: 1
      })
    ).toMatchObject({
      temperature: 2,
      maxTokens: 32000,
      timeoutMs: 1000
    });
  });
});
