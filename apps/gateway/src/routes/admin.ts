import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { GatewayConfig } from "../config";
import {
  CompileEventSink,
  readRecentCompileEvents
} from "../services/compile-events";
import { getGatewayMetricsSnapshot } from "../services/metrics";
import { GatewayMetricsStore } from "../services/metrics-store";

interface AdminRouteDeps {
  metricsStore: GatewayMetricsStore;
  compileEventSink: CompileEventSink;
}

const AdminCompileEventsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional()
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

  app.get("/admin/compile-events", async (request, reply) => {
    if (!requireAdminToken(request, reply, config)) {
      return reply;
    }

    const parsed = AdminCompileEventsQuerySchema.safeParse(request.query);
    const limit = parsed.success ? parsed.data.limit ?? 20 : 20;
    const events = await readRecentCompileEvents(deps.compileEventSink, limit);

    return reply.send({ events });
  });
};
