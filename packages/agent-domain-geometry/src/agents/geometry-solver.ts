import type { PlatformAgentDefinition } from "@geohelper/agent-protocol";
import { createPortablePlatformAgentDefinition } from "@geohelper/agent-sdk";

import { loadGeometryBundle } from "../bundle";

export interface GeometryAgentDefinition extends PlatformAgentDefinition {}

export const createGeometrySolverAgentDefinition =
  (): GeometryAgentDefinition => {
    const bundle = loadGeometryBundle();

    return createPortablePlatformAgentDefinition<GeometryAgentDefinition>({
      bundle
    });
  };
