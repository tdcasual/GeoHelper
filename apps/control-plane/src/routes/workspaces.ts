import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ControlPlaneServices } from "../control-plane-context";

export const registerWorkspacesRoutes = (
  app: FastifyInstance,
  services: ControlPlaneServices
): void => {
  app.get("/api/v3/workspaces/:workspaceId/memory", async (request, reply) => {
    const params = z
      .object({
        workspaceId: z.string().min(1)
      })
      .parse(request.params);
    const query = z
      .object({
        key: z.string().min(1).optional()
      })
      .parse(request.query);

    return reply.send({
      memoryEntries: await services.store.memory.listMemoryEntries({
        scope: "workspace",
        scopeId: params.workspaceId,
        key: query.key
      })
    });
  });
};
