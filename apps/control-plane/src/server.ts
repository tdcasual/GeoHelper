import { fileURLToPath } from "node:url";

import Fastify, { type FastifyInstance } from "fastify";

import {
  createControlPlaneServices,
  type ControlPlaneServices
} from "./control-plane-context";
import { registerAdminCheckpointsRoutes } from "./routes/admin-checkpoints";
import { registerAdminMemoryRoutes } from "./routes/admin-memory";
import { registerAdminRunsRoutes } from "./routes/admin-runs";
import { registerAdminToolsRoutes } from "./routes/admin-tools";
import { registerBrowserSessionsRoutes } from "./routes/browser-sessions";
import { registerCheckpointsRoutes } from "./routes/checkpoints";
import { registerRunsRoutes } from "./routes/runs";
import { registerStreamRoutes } from "./routes/stream";
import { registerThreadsRoutes } from "./routes/threads";

export const buildServer = (
  overrides: Partial<ControlPlaneServices> = {}
): FastifyInstance => {
  const app = Fastify({
    logger: false
  });
  const services = createControlPlaneServices(overrides);

  registerAdminRunsRoutes(app, services);
  registerAdminToolsRoutes(app, services);
  registerAdminMemoryRoutes(app, services);
  registerAdminCheckpointsRoutes(app, services);
  registerThreadsRoutes(app, services);
  registerRunsRoutes(app, services);
  registerCheckpointsRoutes(app, services);
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
