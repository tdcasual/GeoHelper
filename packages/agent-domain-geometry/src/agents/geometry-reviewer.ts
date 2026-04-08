import type { PlatformAgentDefinition } from "@geohelper/agent-protocol";
import { createPortablePlatformAgentDefinition } from "@geohelper/agent-sdk";

import { loadGeometryReviewerBundle } from "../bundle";

export interface GeometryReviewerAgentDefinition extends PlatformAgentDefinition {}

export const createGeometryReviewerAgentDefinition =
  (): GeometryReviewerAgentDefinition => {
    const bundle = loadGeometryReviewerBundle();

    return createPortablePlatformAgentDefinition<GeometryReviewerAgentDefinition>({
      bundle
    });
  };
