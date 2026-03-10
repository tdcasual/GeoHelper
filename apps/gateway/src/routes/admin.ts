import { FastifyInstance } from "fastify";

import { GatewayConfig } from "../config";
import { getGatewayMetricsSnapshot } from "../services/metrics";
import { GatewayMetricsStore } from "../services/metrics-store";

interface AdminRouteDeps {
  metricsStore: GatewayMetricsStore;
}

export const registerAdminRoutes = (
  app: FastifyInstance,
  config: GatewayConfig,
  deps: AdminRouteDeps
): void => {
  app.get("/admin/metrics", async (request, reply) => {
    if (config.adminMetricsToken) {
      const token = request.headers["x-admin-token"];
      if (token !== config.adminMetricsToken) {
        return reply.status(403).send({
          error: {
            code: "FORBIDDEN",
            message: "Admin token is invalid"
          }
        });
      }
    }

    return reply.send(getGatewayMetricsSnapshot(deps.metricsStore));
  });
};
