import { describe, expect, it } from "vitest";

import { createSceneCaptureController } from "./scene-sync";

describe("canvas scene sync", () => {
  it("suppresses immediate flushes while capture is temporarily muted", () => {
    const controller = createSceneCaptureController(() => "<xml />");

    controller.suppress(200);

    expect(controller.canFlushAt(Date.now())).toBe(false);
  });
});
