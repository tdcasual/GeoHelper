import type { FastifyInstance } from "fastify";

import type { ControlPlaneServices } from "../control-plane-context";
import { createPlatformCatalogSnapshot } from "../platform-catalog";

const buildPlatformCatalogPayload = (services: ControlPlaneServices) => ({
  catalog: createPlatformCatalogSnapshot(services)
});

export const registerPlatformCatalogRoutes = (
  app: FastifyInstance,
  services: ControlPlaneServices
): void => {
  app.get("/api/v3/platform/catalog", async () =>
    buildPlatformCatalogPayload(services)
  );

  app.get("/admin/platform/catalog", async () =>
    buildPlatformCatalogPayload(services)
  );
};
