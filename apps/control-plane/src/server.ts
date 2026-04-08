import { fileURLToPath } from "node:url";

import Fastify, { type FastifyInstance } from "fastify";

import {
  type ControlPlaneServices,
  createControlPlaneServices} from "./control-plane-context";
import { registerAcpSessionsRoutes } from "./routes/acp-sessions";
import { registerAdminBundlesRoutes } from "./routes/admin-bundles";
import { registerAdminCheckpointsRoutes } from "./routes/admin-checkpoints";
import { registerAdminEvalsRoutes } from "./routes/admin-evals";
import { registerAdminMemoryRoutes } from "./routes/admin-memory";
import { registerAdminRunsRoutes } from "./routes/admin-runs";
import { registerAdminToolsRoutes } from "./routes/admin-tools";
import { registerArtifactsRoutes } from "./routes/artifacts";
import { registerBrowserSessionsRoutes } from "./routes/browser-sessions";
import { registerCheckpointsRoutes } from "./routes/checkpoints";
import { registerPlatformCatalogRoutes } from "./routes/platform-catalog";
import { registerRunProfilesRoutes } from "./routes/run-profiles";
import { registerRunsRoutes } from "./routes/runs";
import { registerStreamRoutes } from "./routes/stream";
import { registerThreadsRoutes } from "./routes/threads";
import { registerWorkspacesRoutes } from "./routes/workspaces";

export const buildServer = (
  overrides: Partial<ControlPlaneServices> = {}
): FastifyInstance => {
  const app = Fastify({
    logger: false
  });
  const services = createControlPlaneServices(overrides);

  registerAdminRunsRoutes(app, services);
  registerAdminBundlesRoutes(app, services);
  registerAdminToolsRoutes(app, services);
  registerAdminMemoryRoutes(app, services);
  registerAdminCheckpointsRoutes(app, services);
  registerAdminEvalsRoutes(app, services);
  registerPlatformCatalogRoutes(app, services);
  registerThreadsRoutes(app, services);
  registerWorkspacesRoutes(app, services);
  registerArtifactsRoutes(app, services);
  registerRunProfilesRoutes(app, services);
  registerRunsRoutes(app, services);
  registerCheckpointsRoutes(app, services);
  registerAcpSessionsRoutes(app, services);
  registerStreamRoutes(app, services);
  registerBrowserSessionsRoutes(app, services);

  return app;
};

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  const port = Number(process.env.PORT ?? 4310);
  const app = buildServer();

  app.listen({
    host: "0.0.0.0",
    port
  }).catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
}

export const packageName = "@geohelper/control-plane";
