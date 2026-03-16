import { describe, expect, it } from "vitest";

import { toAppletConfig } from "./runtime";

describe("canvas runtime", () => {
  it("keeps autoscale disabled for desktop and mobile profiles", () => {
    expect(toAppletConfig("desktop")).toMatchObject({
      disableAutoScale: true
    });
    expect(toAppletConfig("mobile")).toMatchObject({
      disableAutoScale: true,
      showAlgebraInput: false
    });
  });
});
