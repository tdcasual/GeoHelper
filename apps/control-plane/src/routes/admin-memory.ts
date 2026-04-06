import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ControlPlaneServices } from "../control-plane-context";

export const registerAdminMemoryRoutes = (
  app: FastifyInstance,
  services: ControlPlaneServices
): void => {
  app.get("/admin/memory/writes", async (request) => {
    const query = z
      .object({
        runId: z.string().min(1).optional()
      })
      .parse(request.query);

    const memoryEntries = query.runId
      ? await services.store.memory.listMemoryEntriesForRun(query.runId)
      : await services.store.memory.listMemoryEntries();

    return {
      memoryEntries
    };
  });
};
