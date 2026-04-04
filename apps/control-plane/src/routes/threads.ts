import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ControlPlaneServices } from "../control-plane-context";

const CreateThreadBodySchema = z.object({
  title: z.string().min(1)
});

export const registerThreadsRoutes = (
  app: FastifyInstance,
  services: ControlPlaneServices
): void => {
  app.post("/api/v3/threads", async (request, reply) => {
    const body = CreateThreadBodySchema.parse(request.body);
    const thread = {
      id: services.buildThreadId(),
      title: body.title,
      createdAt: services.now()
    };

    services.threads.set(thread.id, thread);

    return reply.code(201).send({
      thread
    });
  });
};
