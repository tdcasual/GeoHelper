import { describe, expect, it } from "vitest";

import { resolveWorkspaceViewportState } from "./viewport";

describe("workspace viewport", () => {
  it("marks short and compact viewports consistently", () => {
    expect(resolveWorkspaceViewportState({ width: 680, height: 480 })).toEqual({
      compactViewport: true,
      phoneViewport: true,
      shortViewport: true
    });
  });
});
