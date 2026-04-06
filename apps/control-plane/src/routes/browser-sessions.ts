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
const CanvasEvidenceBodySchema = z.discriminatedUnion("storage", [
  z.object({
    contentType: z.string().min(1),
    storage: z.literal("inline"),
    inlineData: z.unknown(),
    metadata: z.record(z.string(), z.unknown()).default({})
  }),
  z.object({
    contentType: z.string().min(1),
    storage: z.literal("blob"),
    blobUri: z.string().min(1),
    metadata: z.record(z.string(), z.unknown()).default({})
  })
]);

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

  app.post(
    "/api/v3/browser-sessions/:sessionId/canvas-evidence",
    async (request, reply) => {
      const params = z
        .object({
          sessionId: z.string().min(1)
        })
        .parse(request.params);
      const body = CanvasEvidenceBodySchema.parse(request.body);
      const session = await services.store.browserSessions.getSession(
        params.sessionId
      );

      if (!session) {
        return reply.code(404).send({
          error: "browser_session_not_found"
        });
      }

      const artifactId = `artifact_${params.sessionId}_${
        (await services.store.artifacts.listRunArtifacts(session.runId)).length + 1
      }`;
      const artifact = {
        id: artifactId,
        runId: session.runId,
        kind: "canvas_evidence" as const,
        contentType: body.contentType,
        storage: body.storage,
        metadata: {
          ...body.metadata,
          sessionId: params.sessionId
        },
        createdAt: services.now(),
        ...(body.storage === "inline"
          ? {
              inlineData: body.inlineData
            }
          : {
              blobUri: body.blobUri
            })
      };

      await services.store.artifacts.writeArtifact(artifact);
      await appendRunEvent(services, session.runId, "canvas_evidence.recorded", {
        artifactId,
        sessionId: params.sessionId
      });

      return reply.code(201).send({
        artifact
      });
    }
  );
};
