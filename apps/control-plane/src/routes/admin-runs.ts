import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ControlPlaneServices } from "../control-plane-context";

const RunsQuerySchema = z.object({
  status: z.string().min(1).optional()
});

export const registerAdminRunsRoutes = (
  app: FastifyInstance,
  services: ControlPlaneServices
): void => {
  app.get("/admin/runs", async (request) => {
    const query = RunsQuerySchema.parse(request.query);
    const runs = await services.store.runs.listRuns({
      status: query.status as never
    });

    return {
      runs
    };
  });

  app.get("/admin/runs/:runId/timeline", async (request, reply) => {
    const params = z
      .object({
        runId: z.string().min(1)
      })
      .parse(request.params);
    const snapshot = await services.store.loadRunSnapshot(params.runId);

    if (!snapshot) {
      return reply.code(404).send({
        error: "run_not_found"
      });
    }

    return {
      run: snapshot.run,
      events: snapshot.events,
      checkpoints: snapshot.checkpoints,
      memoryEntries: snapshot.memoryEntries
    };
  });
};
