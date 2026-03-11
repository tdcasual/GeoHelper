import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { GatewayConfig } from "../config";
import { GatewayBuildInfo } from "../services/build-info";
import {
  CompileEventSink,
  CompileFinalStatus,
  readCompileTraceDetails,
  readRecentCompileEvents
} from "../services/compile-events";
import { getGatewayMetricsSnapshot } from "../services/metrics";
import { GatewayMetricsStore } from "../services/metrics-store";

interface AdminRouteDeps {
  metricsStore: GatewayMetricsStore;
  compileEventSink: CompileEventSink;
  buildInfo: GatewayBuildInfo;
}

const AdminCompileEventsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  traceId: z.string().trim().min(1).optional(),
  requestId: z.string().trim().min(1).optional(),
  mode: z.string().trim().min(1).optional(),
  finalStatus: z.enum([
    "success",
    "fallback",
    "repair",
    "validation_failure",
    "upstream_failure"
  ] satisfies CompileFinalStatus[]).optional(),
  since: z.string().trim().min(1).optional()
});

const requireAdminToken = (
  request: FastifyRequest,
  reply: FastifyReply,
  config: GatewayConfig
): boolean => {
  if (!config.adminMetricsToken) {
    return true;
  }

  const token = request.headers["x-admin-token"];
  if (token === config.adminMetricsToken) {
    return true;
  }

  reply.status(403).send({
    error: {
      code: "FORBIDDEN",
      message: "Admin token is invalid"
    }
  });
  return false;
};

export const registerAdminRoutes = (
  app: FastifyInstance,
  config: GatewayConfig,
  deps: AdminRouteDeps
): void => {
  app.get("/admin/metrics", async (request, reply) => {
    if (!requireAdminToken(request, reply, config)) {
      return reply;
    }

    return reply.send(getGatewayMetricsSnapshot(deps.metricsStore));
  });

  app.get("/admin/version", async (request, reply) => {
    if (!requireAdminToken(request, reply, config)) {
      return reply;
    }

    return reply.send(deps.buildInfo);
  });

  app.get("/admin/compile-events", async (request, reply) => {
    if (!requireAdminToken(request, reply, config)) {
      return reply;
    }

    const parsed = AdminCompileEventsQuerySchema.safeParse(request.query);
    const query = parsed.success
      ? {
          limit: parsed.data.limit ?? 20,
          traceId: parsed.data.traceId,
          requestId: parsed.data.requestId,
          mode: parsed.data.mode,
          finalStatus: parsed.data.finalStatus,
          since: parsed.data.since
        }
      : { limit: 20 };
    const events = await readRecentCompileEvents(deps.compileEventSink, query);

    return reply.send({ events });
  });

  app.get("/admin/traces/:traceId", async (request, reply) => {
    if (!requireAdminToken(request, reply, config)) {
      return reply;
    }

    const params = request.params as { traceId?: string };
    const trace = await readCompileTraceDetails(
      deps.compileEventSink,
      params.traceId ?? ""
    );

    if (!trace) {
      return reply.status(404).send({
        error: {
          code: "TRACE_NOT_FOUND",
          message: "Trace was not found"
        }
      });
    }

    return reply.send(trace);
  });
};
