import { describe, expect, it } from "vitest";

describe("platform agent package scaffolding", () => {
  it("exposes the initial platform packages through workspace imports", async () => {
    const [protocolModule, coreModule, bridgeModule] = await Promise.all([
      import("@geohelper/agent-protocol"),
      import("@geohelper/agent-core"),
      import("@geohelper/browser-bridge")
    ]);

    expect(protocolModule.packageName).toBe("@geohelper/agent-protocol");
    expect(coreModule.packageName).toBe("@geohelper/agent-core");
    expect(bridgeModule.packageName).toBe("@geohelper/browser-bridge");
  });
});
