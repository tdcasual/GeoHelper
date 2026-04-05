import { createGeometryDomainPackage } from "@geohelper/agent-domain-geometry";
import { describe, expect, it } from "vitest";

import { createControlPlaneServices } from "../src/control-plane-context";

describe("control-plane context", () => {
  it("seeds default run profiles from the shared geometry domain registry", () => {
    const services = createControlPlaneServices();
    const geometryDomain = createGeometryDomainPackage();

    expect([...services.runProfiles.keys()]).toEqual(
      Object.keys(geometryDomain.runProfiles)
    );
    expect(services.runProfiles.get("platform_geometry_standard")).toEqual(
      geometryDomain.runProfiles.platform_geometry_standard
    );
    expect(services.runProfiles.get("platform_geometry_quick_draft")).toEqual(
      geometryDomain.runProfiles.platform_geometry_quick_draft
    );
  });

  it("exposes the default platform bootstrap alongside the derived run profile map", () => {
    const services = createControlPlaneServices();

    expect(services.platformRuntime.bootstrap.runProfiles.platform_geometry_standard).toBeDefined();
    expect(services.platformRuntime.tools["scene.read_state"]).toBeDefined();
    expect(services.runProfiles).toBe(services.platformRuntime.runProfiles);
  });
});
