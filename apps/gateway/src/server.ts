import Fastify, { FastifyInstance } from "fastify";
import { fileURLToPath } from "node:url";

import { loadConfig } from "./config";
import { registerAdminRoutes } from "./routes/admin";
import { registerAuthRoutes } from "./routes/auth";
import { registerCompileRoute } from "./routes/compile";
import { registerHealthRoute } from "./routes/health";
import { sendAlert } from "./services/alerting";
import {
  createRedisKvClient,
  KvClient
} from "./services/kv-client";
import {
  getDefaultMetricsStore,
  GatewayMetricsStore
} from "./services/metrics";
import {
  requestCommandBatch as defaultRequestCommandBatch,
  RequestCommandBatch
} from "./services/litellm-client";
import {
  getDefaultRateLimitStore,
  RateLimitStore
} from "./services/rate-limit";
import { createRedisRateLimitStore } from "./services/redis-rate-limit-store";
import { createRedisSessionRevocationStore } from "./services/redis-session-store";
import {
  getDefaultSessionRevocationStore,
  SessionRevocationStore
} from "./services/session";

export interface GatewayServices {
  requestCommandBatch: RequestCommandBatch;
  sessionStore: SessionRevocationStore;
  rateLimitStore: RateLimitStore;
  metricsStore: GatewayMetricsStore;
  kvClient?: KvClient;
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
  const ownedKvClient =
    !serviceOverrides.kvClient && config.redisUrl
      ? createRedisKvClient(config.redisUrl)
      : undefined;
  const kvClient = serviceOverrides.kvClient ?? ownedKvClient;
  const services: GatewayServices = {
    requestCommandBatch:
      serviceOverrides.requestCommandBatch ?? defaultRequestCommandBatch,
    sessionStore:
      serviceOverrides.sessionStore ??
      (kvClient
        ? createRedisSessionRevocationStore(kvClient)
        : getDefaultSessionRevocationStore()),
    rateLimitStore:
      serviceOverrides.rateLimitStore ??
      (kvClient
        ? createRedisRateLimitStore(kvClient)
        : getDefaultRateLimitStore()),
    metricsStore: serviceOverrides.metricsStore ?? getDefaultMetricsStore(),
    kvClient
  };

  if (ownedKvClient?.disconnect) {
    app.addHook("onClose", async () => {
      await ownedKvClient.disconnect?.();
    });
  }

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
  registerAdminRoutes(app, config, {
    metricsStore: services.metricsStore
  });
  registerAuthRoutes(app, config, {
    sessionStore: services.sessionStore
  });
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
