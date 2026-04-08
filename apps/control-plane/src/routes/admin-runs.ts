import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ControlPlaneServices } from "../control-plane-context";

const RunsQuerySchema = z.object({
  status: z.string().min(1).optional(),
  parentRunId: z.string().min(1).optional()
});

export const registerAdminRunsRoutes = (
  app: FastifyInstance,
  services: ControlPlaneServices
): void => {
  app.get("/admin/runs", async (request) => {
    const query = RunsQuerySchema.parse(request.query);
    const runs = await services.store.runs.listRuns({
      status: query.status as never,
      parentRunId: query.parentRunId
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

    const [childRuns, acpSessions] = await Promise.all([
      services.store.runs.listRuns({
        parentRunId: params.runId
      }),
      services.store.acpSessions.listSessions({
        runId: params.runId
      })
    ]);

    return {
      run: snapshot.run,
      events: snapshot.events,
      childRuns,
      checkpoints: snapshot.checkpoints,
      acpSessions,
      memoryEntries: snapshot.memoryEntries
    };
  });
};
