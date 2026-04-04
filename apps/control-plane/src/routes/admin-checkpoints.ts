import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ControlPlaneServices } from "../control-plane-context";

export const registerAdminCheckpointsRoutes = (
  app: FastifyInstance,
  services: ControlPlaneServices
): void => {
  app.get("/admin/checkpoints", async (request) => {
    const query = z
      .object({
        status: z
          .enum(["pending", "resolved", "expired", "cancelled"])
          .optional()
      })
      .parse(request.query);
    const checkpoints = query.status
      ? await services.store.checkpoints.listCheckpointsByStatus(query.status)
      : (
          await Promise.all(
            ["pending", "resolved", "expired", "cancelled"].map((status) =>
              services.store.checkpoints.listCheckpointsByStatus(
                status as "pending" | "resolved" | "expired" | "cancelled"
              )
            )
          )
        ).flat();

    return {
      checkpoints
    };
  });
};
