import { describe, expect, it, vi } from "vitest";

import { createRuntimeAdapter, createSceneCaptureController } from "./scene-sync";

describe("canvas scene sync", () => {
  it("suppresses immediate flushes while capture is temporarily muted", () => {
    const controller = createSceneCaptureController(() => "<xml />");

    controller.suppress(200);

    expect(controller.canFlushAt(Date.now())).toBe(false);
  });

  it("bridges focus requests through best-effort applet APIs", () => {
    const setSelectedObject = vi.fn();
    const clearSelectedObjects = vi.fn();
    const suppressSceneCapture = vi.fn();
    const adapter = createRuntimeAdapter(
      {
        evalCommand: vi.fn(),
        setValue: vi.fn(),
        setSelectedObject,
        clearSelectedObjects
      },
      suppressSceneCapture
    );

    expect(adapter.focusObjects?.(["A", "B"])).toBe(true);
    expect(clearSelectedObjects).toHaveBeenCalledTimes(1);
    expect(setSelectedObject).toHaveBeenNthCalledWith(1, "A", true);
    expect(setSelectedObject).toHaveBeenNthCalledWith(2, "B", true);
    expect(suppressSceneCapture).toHaveBeenCalled();

    adapter.clearFocusedObjects?.();
    expect(clearSelectedObjects).toHaveBeenCalledTimes(2);
  });

  it("returns false when the applet has no focus helpers", () => {
    const adapter = createRuntimeAdapter(
      {
        evalCommand: vi.fn(),
        setValue: vi.fn()
      },
      vi.fn()
    );

    expect(adapter.focusObjects?.(["A"])).toBe(false);
  });
});
