import { describe, expect, it } from "vitest";

import { toAppletConfig } from "./canvas-panel/runtime";

describe("toAppletConfig", () => {
  it("disables GeoGebra autoscale for desktop and mobile profiles", () => {
    expect(toAppletConfig("desktop")).toMatchObject({
      disableAutoScale: true,
      showAlgebraInput: true,
      showMenuBar: true,
      showToolBarHelp: true
    });

    expect(toAppletConfig("mobile")).toMatchObject({
      disableAutoScale: true,
      showAlgebraInput: false,
      showMenuBar: false,
      showToolBarHelp: false
    });
  });
});
