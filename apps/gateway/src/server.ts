import { fileURLToPath } from "node:url";

import Fastify, { FastifyInstance, FastifyReply } from "fastify";

import { loadConfig } from "./config";
import { registerAdminRoutes } from "./routes/admin";
import { registerAuthRoutes } from "./routes/auth";
import { registerHealthRoute } from "./routes/health";
import { GatewayAlertEvent, sendAlert } from "./services/alerting";
import {
  createMemoryBackupStore,
  GatewayBackupStore
} from "./services/backup-store";
import { createGatewayBuildInfo, GatewayBuildInfo } from "./services/build-info";
import {
  createRedisKvClient,
  KvClient
} from "./services/kv-client";
import {
  getDefaultMetricsStore,
} from "./services/metrics";
import { GatewayMetricsStore } from "./services/metrics-store";
import { createRedisBackupStore } from "./services/redis-backup-store";
import { createRedisSessionRevocationStore } from "./services/redis-session-store";
import {
  createRedisRuntimeDependencyCheck,
  createRuntimeReadinessService,
  RuntimeReadinessService
} from "./services/runtime-readiness";
import {
  getDefaultSessionRevocationStore,
} from "./services/session";
import { SessionRevocationStore } from "./services/session-store";

interface GatewayReplyWithAlert extends FastifyReply {
  geohelperAlertEvent?: GatewayAlertEvent;
}

export interface GatewayServices {
  sessionStore: SessionRevocationStore;
  metricsStore: GatewayMetricsStore;
  runtimeReadinessService: RuntimeReadinessService;
  buildInfo: GatewayBuildInfo;
  backupStore: GatewayBackupStore;
  kvClient?: KvClient;
}

const buildGatewayTraceId = (requestId: string): string => `tr_${requestId}`;

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
  const buildInfo = createGatewayBuildInfo(envOverrides, config);
  const ownedKvClient =
    !serviceOverrides.kvClient && config.redisUrl
      ? createRedisKvClient(config.redisUrl)
      : undefined;
  const kvClient = serviceOverrides.kvClient ?? ownedKvClient;
  const runtimeReadinessChecks =
    config.redisUrl && kvClient
      ? [createRedisRuntimeDependencyCheck(kvClient)]
      : [];
  const services: GatewayServices = {
    sessionStore:
      serviceOverrides.sessionStore ??
      (kvClient
        ? createRedisSessionRevocationStore(kvClient)
        : getDefaultSessionRevocationStore()),
    metricsStore: serviceOverrides.metricsStore ?? getDefaultMetricsStore(),
    runtimeReadinessService:
      serviceOverrides.runtimeReadinessService ??
      createRuntimeReadinessService(runtimeReadinessChecks),
    buildInfo: serviceOverrides.buildInfo ?? buildInfo,
    backupStore:
      serviceOverrides.backupStore ??
      (config.redisUrl && kvClient
        ? createRedisBackupStore(kvClient, {
            maxHistory: config.backupMaxHistory,
            maxProtected: config.backupMaxProtected
          })
        : createMemoryBackupStore({
            maxHistory: config.backupMaxHistory,
            maxProtected: config.backupMaxProtected
          })),
    kvClient
  };

  if (ownedKvClient?.disconnect) {
    app.addHook("onClose", async () => {
      await ownedKvClient.disconnect?.();
    });
  }

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-trace-id", buildGatewayTraceId(request.id));
  });

  app.addHook("onResponse", async (request, reply) => {
    const responseAlert = (reply as GatewayReplyWithAlert).geohelperAlertEvent;
    if (responseAlert) {
      await sendAlert(config.alertWebhookUrl, responseAlert);
      return;
    }

    if (reply.statusCode >= 500) {
      await sendAlert(config.alertWebhookUrl, {
        traceId: buildGatewayTraceId(request.id),
        path: request.url,
        method: request.method,
        statusCode: reply.statusCode
      });
    }
  });

  registerHealthRoute(app, {
    runtimeReadinessService: services.runtimeReadinessService
  });
  registerAdminRoutes(app, config, {
    metricsStore: services.metricsStore,
    buildInfo: services.buildInfo,
    backupStore: services.backupStore
  });
  registerAuthRoutes(app, config, {
    sessionStore: services.sessionStore
  });

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
