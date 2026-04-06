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
  app.get("/api/v3/threads/:threadId", async (request, reply) => {
    const params = z
      .object({
        threadId: z.string().min(1)
      })
      .parse(request.params);
    const thread = await services.store.threads.getThread(params.threadId);

    if (!thread) {
      return reply.code(404).send({
        error: "thread_not_found"
      });
    }

    return reply.send({
      thread
    });
  });

  app.post("/api/v3/threads", async (request, reply) => {
    const body = CreateThreadBodySchema.parse(request.body);
    const thread = {
      id: services.buildThreadId(),
      title: body.title,
      createdAt: services.now()
    };

    await services.store.threads.createThread(thread);

    return reply.code(201).send({
      thread
    });
  });
};
