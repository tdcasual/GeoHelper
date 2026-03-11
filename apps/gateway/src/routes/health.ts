import { FastifyInstance } from "fastify";

import { RuntimeReadinessService } from "../services/runtime-readiness";

interface HealthRouteDeps {
  runtimeReadinessService: RuntimeReadinessService;
}

export const registerHealthRoute = (
  app: FastifyInstance,
  deps: HealthRouteDeps
): void => {
  app.get("/api/v1/health", async () => ({
    status: "ok",
    time: new Date().toISOString()
  }));

  app.get("/api/v1/ready", async (_request, reply) => {
    const snapshot = await deps.runtimeReadinessService.snapshot();
    return reply.status(snapshot.ready ? 200 : 503).send(snapshot);
  });
};
