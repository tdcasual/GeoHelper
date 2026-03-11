import Fastify, { FastifyInstance, FastifyReply } from "fastify";
import { fileURLToPath } from "node:url";

import { loadConfig } from "./config";
import { registerAdminRoutes } from "./routes/admin";
import { registerAuthRoutes } from "./routes/auth";
import { registerCompileRoute } from "./routes/compile";
import { registerHealthRoute } from "./routes/health";
import {
  createRedisRuntimeDependencyCheck,
  createRuntimeReadinessService,
  RuntimeReadinessService
} from "./services/runtime-readiness";
import { GatewayAlertEvent, sendAlert } from "./services/alerting";
import { createGatewayBuildInfo, GatewayBuildInfo } from "./services/build-info";
import { createCompileGuard, CompileGuard } from "./services/compile-guard";
import {
  buildTraceId,
  CompileEventSink,
  createFanoutCompileEventSink,
  createLogCompileEventSink,
  createMemoryCompileEventSink
} from "./services/compile-events";
import {
  createMemoryBackupStore,
  GatewayBackupStore
} from "./services/backup-store";
import { createRedisCompileEventSink } from "./services/redis-compile-event-sink";
import { createRedisBackupStore } from "./services/redis-backup-store";
import {
  createRedisKvClient,
  KvClient
} from "./services/kv-client";
import {
  getDefaultMetricsStore,
} from "./services/metrics";
import { GatewayMetricsStore } from "./services/metrics-store";
import {
  requestCommandBatch as defaultRequestCommandBatch,
  RequestCommandBatch
} from "./services/litellm-client";
import {
  getDefaultRateLimitStore,
} from "./services/rate-limit";
import { RateLimitStore } from "./services/rate-limit-store";
import { createRedisRateLimitStore } from "./services/redis-rate-limit-store";
import { createRedisSessionRevocationStore } from "./services/redis-session-store";
import {
  getDefaultSessionRevocationStore,
} from "./services/session";
import { SessionRevocationStore } from "./services/session-store";

interface GatewayReplyWithAlert extends FastifyReply {
  geohelperAlertEvent?: GatewayAlertEvent;
}

export interface GatewayServices {
  requestCommandBatch: RequestCommandBatch;
  sessionStore: SessionRevocationStore;
  rateLimitStore: RateLimitStore;
  metricsStore: GatewayMetricsStore;
  compileEventSink: CompileEventSink;
  runtimeReadinessService: RuntimeReadinessService;
  compileGuard: CompileGuard;
  buildInfo: GatewayBuildInfo;
  backupStore: GatewayBackupStore;
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
  const operatorCompileEventSink =
    config.redisUrl && kvClient
      ? createRedisCompileEventSink(kvClient)
      : createMemoryCompileEventSink();
  const defaultCompileEventSink = createFanoutCompileEventSink(
    createLogCompileEventSink(app.log),
    operatorCompileEventSink
  );
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
    compileEventSink:
      serviceOverrides.compileEventSink ?? defaultCompileEventSink,
    runtimeReadinessService:
      serviceOverrides.runtimeReadinessService ??
      createRuntimeReadinessService(runtimeReadinessChecks),
    compileGuard:
      serviceOverrides.compileGuard ??
      createCompileGuard({
        maxInFlight: config.compileMaxInFlight,
        timeoutMs: config.compileTimeoutMs
      }),
    buildInfo: serviceOverrides.buildInfo ?? buildInfo,
    backupStore:
      serviceOverrides.backupStore ??
      (config.redisUrl && kvClient
        ? createRedisBackupStore(kvClient)
        : createMemoryBackupStore()),
    kvClient
  };

  if (ownedKvClient?.disconnect) {
    app.addHook("onClose", async () => {
      await ownedKvClient.disconnect?.();
    });
  }

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-trace-id", buildTraceId(request.id));
  });

  app.addHook("onResponse", async (request, reply) => {
    const responseAlert = (reply as GatewayReplyWithAlert).geohelperAlertEvent;
    if (responseAlert) {
      await sendAlert(config.alertWebhookUrl, responseAlert);
      return;
    }

    if (reply.statusCode >= 500) {
      await sendAlert(config.alertWebhookUrl, {
        traceId: buildTraceId(request.id),
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
    compileEventSink: services.compileEventSink,
    buildInfo
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
