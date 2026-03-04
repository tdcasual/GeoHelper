import Fastify, { FastifyInstance } from "fastify";
import { fileURLToPath } from "node:url";

import { loadConfig } from "./config";
import { registerHealthRoute } from "./routes/health";

export const buildServer = (): FastifyInstance => {
  const app = Fastify({ logger: false });
  registerHealthRoute(app);

  return app;
};

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  const config = loadConfig();
  const app = buildServer();

  app
    .listen({ host: "0.0.0.0", port: config.port })
    .catch((err) => {
      app.log.error(err);
      process.exit(1);
    });
}
