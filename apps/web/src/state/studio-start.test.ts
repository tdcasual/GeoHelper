import { describe, expect, it } from "vitest";

import {
  resolveStudioStartCopy,
  STUDIO_START_ACTIONS,
  TEACHER_SCENARIO_SEEDS
} from "./studio-start";

describe("studio-start", () => {
  it("exposes only the three validated teacher-first start actions", () => {
    expect(STUDIO_START_ACTIONS.map((item) => item.mode)).toEqual([
      "image",
      "text",
      "continue"
    ]);
  });

  it("provides teacher scenario seeds with required fields", () => {
    expect(TEACHER_SCENARIO_SEEDS.length).toBeGreaterThanOrEqual(3);

    for (const seed of TEACHER_SCENARIO_SEEDS) {
      expect(seed.title).toBeTruthy();
      expect(seed.summary).toBeTruthy();
      expect(seed.inputMode).toMatch(/^(image|text)$/);
      expect(seed.seedPrompt).toBeTruthy();
    }
  });

  it("uses generation-first copy instead of chat-first copy", () => {
    const copy = resolveStudioStartCopy();

    expect(copy.title).toContain("可编辑几何图");
    expect(copy.primaryActionLabel).toBe("开始生成图形");
    expect(copy.primaryActionLabel).not.toContain("聊天");
    expect(copy.title).not.toContain("聊天");
  });
});
