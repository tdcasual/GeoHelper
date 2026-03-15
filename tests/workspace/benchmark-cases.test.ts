import fs from "node:fs";

import { describe, expect, it } from "vitest";

describe("quality benchmark cases", () => {
  it("contains 20 cases for each geometry domain", () => {
    const raw = fs.readFileSync("benchmarks/command-quality-cases.json", "utf8");
    const payload = JSON.parse(raw) as {
      cases: Array<{ domain: string; prompt: string }>;
    };

    const byDomain = payload.cases.reduce<Record<string, number>>((acc, item) => {
      acc[item.domain] = (acc[item.domain] ?? 0) + 1;
      return acc;
    }, {});

    expect(byDomain["2d"]).toBe(20);
    expect(byDomain["3d"]).toBe(20);
    expect(byDomain["cas"]).toBe(20);
    expect(byDomain["probability"]).toBe(20);
  });
});
