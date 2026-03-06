import { describe, expect, it } from "vitest";
import {
  resolveVendorAssetUrl,
  toGeoGebraRuntimeConfig
} from "./vendor-runtime";

describe("toGeoGebraRuntimeConfig", () => {
  it("prefixes vendor asset paths with the Vite base url", () => {
    const runtime = toGeoGebraRuntimeConfig(
      {
        deployScriptPath: "/vendor/geogebra/current/deployggb.js",
        html5CodebasePath: "/vendor/geogebra/current/HTML5/5.2.918.0/web3d/"
      },
      "/geohelper/"
    );

    expect(runtime.deployScriptUrl).toBe(
      "/geohelper/vendor/geogebra/current/deployggb.js"
    );
    expect(runtime.html5CodebaseUrl).toBe(
      "/geohelper/vendor/geogebra/current/HTML5/5.2.918.0/web3d/"
    );
  });

  it("keeps root-relative vendor asset paths stable for root base urls", () => {
    expect(resolveVendorAssetUrl("/", "/vendor/geogebra/manifest.json")).toBe(
      "/vendor/geogebra/manifest.json"
    );
  });
});
