import type { FastifyInstance } from "fastify";

import type { ControlPlaneServices } from "../control-plane-context";

export const registerRunProfilesRoutes = (
  app: FastifyInstance,
  services: ControlPlaneServices
): void => {
  app.get("/api/v3/run-profiles", async () => ({
    runProfiles: [...services.runProfiles.values()]
  }));
};
