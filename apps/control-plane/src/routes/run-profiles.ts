import type { FastifyInstance } from "fastify";

import type { ControlPlaneServices } from "../control-plane-context";
import { createPlatformCatalogSnapshot } from "../platform-catalog";

export const registerRunProfilesRoutes = (
  app: FastifyInstance,
  services: ControlPlaneServices
): void => {
  app.get("/api/v3/run-profiles", async () => ({
    runProfiles: createPlatformCatalogSnapshot(services).runProfiles
  }));
};
