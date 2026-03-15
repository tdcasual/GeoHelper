import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildVendorManifest,
  detectBundleLayout} from "../../scripts/geogebra/lib/validate-bundle.mjs";

describe("detectBundleLayout", () => {
  it("finds deployggb.js and the html5 web3d codebase", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ggb-layout-"));
    await fs.mkdir(path.join(root, "HTML5", "5.2.918.0", "web3d", "js"), {
      recursive: true
    });
    await fs.writeFile(
      path.join(root, "deployggb.js"),
      "window.GGBApplet = function(){};"
    );
    await fs.writeFile(
      path.join(root, "HTML5", "5.2.918.0", "web3d", "js", "properties_keys_zh-CN.js"),
      ""
    );

    const layout = await detectBundleLayout(root);
    const manifest = buildVendorManifest({
      version: "5.4.918.0",
      resolvedFrom: "latest",
      sourceUrl:
        "https://download.geogebra.org/installers/5.4/geogebra-math-apps-bundle-5-4-918-0.zip",
      publishRoot: "/vendor/geogebra/current",
      layout
    });

    expect(layout.deployScriptRelativePath).toBe("deployggb.js");
    expect(layout.html5CodebaseRelativePath).toBe("HTML5/5.2.918.0/web3d/");
    expect(manifest.html5CodebasePath).toBe(
      "/vendor/geogebra/current/HTML5/5.2.918.0/web3d/"
    );
  });
});
