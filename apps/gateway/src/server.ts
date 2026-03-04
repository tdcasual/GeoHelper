import Fastify, { FastifyInstance } from "fastify";
import { fileURLToPath } from "node:url";

import { loadConfig } from "./config";
import { registerAuthRoutes } from "./routes/auth";
import { registerHealthRoute } from "./routes/health";

export const buildServer = (
  envOverrides: Partial<NodeJS.ProcessEnv> = {}
): FastifyInstance => {
  const app = Fastify({ logger: false });
  const config = loadConfig(envOverrides);

  registerHealthRoute(app);
  registerAuthRoutes(app, config);

  return app;
};

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  const config = loadConfig();
  const app = buildServer(process.env);

  app
    .listen({ host: "0.0.0.0", port: config.port })
    .catch((err) => {
      app.log.error(err);
      process.exit(1);
    });
}
