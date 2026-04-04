import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ControlPlaneServices } from "../control-plane-context";

export const registerStreamRoutes = (
  app: FastifyInstance,
  services: ControlPlaneServices
): void => {
  app.get("/api/v3/runs/:runId/stream", async (request, reply) => {
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

    reply.hijack();
    reply.raw.statusCode = 200;
    reply.raw.setHeader("content-type", "text/event-stream; charset=utf-8");
    reply.raw.write("event: run.snapshot\n");
    reply.raw.write(`data: ${JSON.stringify(snapshot)}\n\n`);
    reply.raw.end();

    return reply;
  });
};
