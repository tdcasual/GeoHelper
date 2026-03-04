import Fastify, { FastifyInstance } from "fastify";
import { fileURLToPath } from "node:url";

import { loadConfig } from "./config";
import { registerAuthRoutes } from "./routes/auth";
import { registerCompileRoute } from "./routes/compile";
import { registerHealthRoute } from "./routes/health";
import { sendAlert } from "./services/alerting";
import {
  requestCommandBatch as defaultRequestCommandBatch,
  RequestCommandBatch
} from "./services/litellm-client";

export interface GatewayServices {
  requestCommandBatch: RequestCommandBatch;
}

export const buildServer = (
  envOverrides: Partial<NodeJS.ProcessEnv> = {},
  serviceOverrides: Partial<GatewayServices> = {}
): FastifyInstance => {
  const app = Fastify({
    logger: {
      level: "info",
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.x-byok-key",
          "req.body.token",
          "res.headers.authorization"
        ],
        remove: true
      }
    }
  });
  const config = loadConfig(envOverrides);
  const services: GatewayServices = {
    requestCommandBatch: defaultRequestCommandBatch,
    ...serviceOverrides
  };

  app.addHook("onResponse", async (request, reply) => {
    if (reply.statusCode >= 500) {
      await sendAlert(config.alertWebhookUrl, {
        traceId: request.id,
        path: request.url,
        method: request.method,
        statusCode: reply.statusCode
      });
    }
  });

  registerHealthRoute(app);
  registerAuthRoutes(app, config);
  registerCompileRoute(app, config, services);

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
