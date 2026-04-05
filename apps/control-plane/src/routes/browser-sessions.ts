import type { FastifyInstance } from "fastify";
import { z } from "zod";

import {
  appendRunEvent,
  type ControlPlaneServices
} from "../control-plane-context";

const CreateBrowserSessionBodySchema = z.object({
  runId: z.string().min(1),
  allowedToolNames: z.array(z.string().min(1)).default([])
});

const BrowserToolResultBodySchema = z.object({
  runId: z.string().min(1),
  toolName: z.string().min(1),
  status: z.enum(["completed", "failed"]),
  output: z.unknown()
});

export const registerBrowserSessionsRoutes = (
  app: FastifyInstance,
  services: ControlPlaneServices
): void => {
  app.post("/api/v3/browser-sessions", async (request, reply) => {
    const body = CreateBrowserSessionBodySchema.parse(request.body);
    const run = await services.store.runs.getRun(body.runId);

    if (!run) {
      return reply.code(404).send({
        error: "run_not_found"
      });
    }

    const session = {
      id: services.buildBrowserSessionId(),
      runId: body.runId,
      allowedToolNames: body.allowedToolNames,
      createdAt: services.now()
    };

    await services.store.browserSessions.createSession(session);

    return reply.code(201).send({
      session
    });
  });

  app.post(
    "/api/v3/browser-sessions/:sessionId/tool-results",
    async (request, reply) => {
      const params = z
        .object({
          sessionId: z.string().min(1)
        })
        .parse(request.params);
      const body = BrowserToolResultBodySchema.parse(request.body);
      const session = await services.store.browserSessions.getSession(
        params.sessionId
      );

      if (
        !session ||
        session.runId !== body.runId ||
        !session.allowedToolNames.includes(body.toolName)
      ) {
        return reply.code(400).send({
          error: "invalid_browser_tool_result"
        });
      }

      await appendRunEvent(services, body.runId, "browser_tool.result", {
        sessionId: params.sessionId,
        toolName: body.toolName,
        status: body.status
      });
      const pendingCheckpoint = (
        await services.store.checkpoints.listRunCheckpoints(body.runId)
      ).find(
        (checkpoint) =>
          checkpoint.status === "pending" && checkpoint.kind === "tool_result"
      );

      if (!pendingCheckpoint) {
        return reply.code(409).send({
          error: "browser_tool_checkpoint_not_found"
        });
      }

      await services.resumeRunFromBrowserTool({
        runId: body.runId,
        checkpointId: pendingCheckpoint.id,
        output: body.output
      });

      return reply.code(202).send({
        accepted: true
      });
    }
  );
};
