import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ControlPlaneServices } from "../control-plane-context";

export const registerAdminToolsRoutes = (
  app: FastifyInstance,
  services: ControlPlaneServices
): void => {
  app.get("/admin/tools/usage", async (request) => {
    const query = z
      .object({
        runId: z.string().min(1).optional()
      })
      .parse(request.query);

    const snapshots = query.runId
      ? [await services.store.loadRunSnapshot(query.runId)].filter(Boolean)
      : await Promise.all(
          (await services.store.runs.listRuns()).map((run) =>
            services.store.loadRunSnapshot(run.id)
          )
        );

    const toolEvents = snapshots
      .flatMap((snapshot) => snapshot?.events ?? [])
      .filter((event) => event.type === "browser_tool.result");

    return {
      toolEvents
    };
  });
};
