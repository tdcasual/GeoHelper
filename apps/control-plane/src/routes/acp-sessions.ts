import {
  ArtifactKindSchema,
  CheckpointSchema,
  type Run
} from "@geohelper/agent-protocol";
import type { AcpSessionRecord } from "@geohelper/agent-store";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import {
  appendRunEvent,
  type ControlPlaneServices
} from "../control-plane-context";

const ListAcpSessionsQuerySchema = z.object({
  runId: z.string().min(1).optional(),
  status: z.enum(["pending", "completed", "failed", "cancelled"]).optional(),
  agentRef: z.string().min(1).optional(),
  serviceRef: z.string().min(1).optional(),
  claimedBy: z.string().min(1).optional()
});

const ClaimAcpSessionBodySchema = z.object({
  executorId: z.string().min(1),
  agentRef: z.string().min(1).optional(),
  serviceRef: z.string().min(1).optional(),
  ttlSeconds: z.number().int().positive().max(3600).optional()
});

const UpdateAcpSessionClaimBodySchema = z.object({
  executorId: z.string().min(1),
  ttlSeconds: z.number().int().positive().max(3600).optional()
});

const AcpArtifactBodySchema = z.discriminatedUnion("storage", [
  z.object({
    kind: ArtifactKindSchema,
    contentType: z.string().min(1),
    storage: z.literal("inline"),
    inlineData: z.unknown(),
    metadata: z.record(z.string(), z.unknown()).default({})
  }),
  z.object({
    kind: ArtifactKindSchema,
    contentType: z.string().min(1),
    storage: z.literal("blob"),
    blobUri: z.string().min(1),
    metadata: z.record(z.string(), z.unknown()).default({})
  })
]);

const SubmitAcpSessionResultBodySchema = z.object({
  executorId: z.string().min(1).optional(),
  status: z.enum(["completed", "failed"]),
  result: z.unknown().optional(),
  artifacts: z.array(AcpArtifactBodySchema).default([])
});

const DEFAULT_CLAIM_TTL_SECONDS = 300;

const addSeconds = (timestamp: string, seconds: number): string =>
  new Date(Date.parse(timestamp) + seconds * 1000).toISOString();

const isClaimActive = (
  session: {
    claimedBy?: string;
    claimExpiresAt?: string;
  },
  now: string
): boolean =>
  Boolean(
    session.claimedBy &&
      session.claimExpiresAt &&
      session.claimExpiresAt > now
  );

const serializeAcpSession = <
  T extends {
    claimedBy?: string;
    claimedAt?: string;
    claimExpiresAt?: string;
  }
>(
  session: T
) => ({
  ...session,
  claimedBy: session.claimedBy ?? null,
  claimedAt: session.claimedAt ?? null,
  claimExpiresAt: session.claimExpiresAt ?? null
});

const hydrateSession = async (
  services: ControlPlaneServices,
  session: AcpSessionRecord
) =>
  serializeAcpSession({
    ...session,
    run: await services.store.runs.getRun(session.runId),
    checkpoint: await services.store.checkpoints.getCheckpoint(session.checkpointId)
  });

const mergeArtifactIds = (
  existingArtifactIds: string[],
  nextArtifactIds: string[]
): string[] => [...new Set([...existingArtifactIds, ...nextArtifactIds])];

const buildAcpArtifactId = (sessionId: string, index: number): string =>
  `artifact_${sessionId}_${index + 1}`;

const persistRun = async (
  services: ControlPlaneServices,
  run: Run
): Promise<void> => {
  await services.store.runs.createRun(run);
};

export const registerAcpSessionsRoutes = (
  app: FastifyInstance,
  services: ControlPlaneServices
): void => {
  app.get("/api/v3/acp-sessions", async (request) => {
    const query = ListAcpSessionsQuerySchema.parse(request.query);
    const sessions = await services.store.acpSessions.listSessions(query);
    const hydrated = await Promise.all(sessions.map((session) => hydrateSession(services, session)));

    return {
      sessions: hydrated
    };
  });

  app.post("/api/v3/acp-sessions/claim", async (request) => {
    const body = ClaimAcpSessionBodySchema.parse(request.body);
    const now = services.now();
    const ttlSeconds = body.ttlSeconds ?? DEFAULT_CLAIM_TTL_SECONDS;
    const session = (
      await services.store.acpSessions.listSessions({
        status: "pending",
        agentRef: body.agentRef,
        serviceRef: body.serviceRef
      })
    ).find((candidate) => !isClaimActive(candidate, now));

    if (!session) {
      return {
        claimed: false,
        session: null
      };
    }

    const claimedSession = {
      ...session,
      claimedBy: body.executorId,
      claimedAt: now,
      claimExpiresAt: addSeconds(now, ttlSeconds),
      updatedAt: now
    };

    await services.store.acpSessions.upsertSession(claimedSession);

    return {
      claimed: true,
      session: await hydrateSession(services, claimedSession)
    };
  });

  app.get("/api/v3/acp-sessions/:sessionId", async (request, reply) => {
    const params = z
      .object({
        sessionId: z.string().min(1)
      })
      .parse(request.params);
    const session = await services.store.acpSessions.getSession(params.sessionId);

    if (!session) {
      return reply.code(404).send({
        error: "acp_session_not_found"
      });
    }

    return {
      session: await hydrateSession(services, session)
    };
  });

  app.post("/api/v3/acp-sessions/:sessionId/heartbeat", async (request, reply) => {
    const params = z
      .object({
        sessionId: z.string().min(1)
      })
      .parse(request.params);
    const body = UpdateAcpSessionClaimBodySchema.parse(request.body);
    const session = await services.store.acpSessions.getSession(params.sessionId);

    if (!session) {
      return reply.code(404).send({
        error: "acp_session_not_found"
      });
    }

    if (session.status !== "pending" || session.claimedBy !== body.executorId) {
      return reply.code(409).send({
        error: "acp_session_claim_not_owned"
      });
    }

    const now = services.now();
    const updatedSession = {
      ...session,
      claimExpiresAt: addSeconds(
        now,
        body.ttlSeconds ?? DEFAULT_CLAIM_TTL_SECONDS
      ),
      updatedAt: now
    };

    await services.store.acpSessions.upsertSession(updatedSession);

    return {
      session: await hydrateSession(services, updatedSession)
    };
  });

  app.post("/api/v3/acp-sessions/:sessionId/release", async (request, reply) => {
    const params = z
      .object({
        sessionId: z.string().min(1)
      })
      .parse(request.params);
    const body = UpdateAcpSessionClaimBodySchema.parse(request.body);
    const session = await services.store.acpSessions.getSession(params.sessionId);

    if (!session) {
      return reply.code(404).send({
        error: "acp_session_not_found"
      });
    }

    if (session.status !== "pending" || session.claimedBy !== body.executorId) {
      return reply.code(409).send({
        error: "acp_session_claim_not_owned"
      });
    }

    const updatedSession = {
      ...session,
      claimedBy: undefined,
      claimedAt: undefined,
      claimExpiresAt: undefined,
      updatedAt: services.now()
    };

    await services.store.acpSessions.upsertSession(updatedSession);

    return {
      session: await hydrateSession(services, updatedSession)
    };
  });

  app.post("/api/v3/acp-sessions/:sessionId/result", async (request, reply) => {
    const params = z
      .object({
        sessionId: z.string().min(1)
      })
      .parse(request.params);
    const body = SubmitAcpSessionResultBodySchema.parse(request.body);
    const session = await services.store.acpSessions.getSession(params.sessionId);

    if (!session) {
      return reply.code(404).send({
        error: "acp_session_not_found"
      });
    }

    if (session.status !== "pending") {
      return reply.code(409).send({
        error: "acp_session_not_pending"
      });
    }

    if (session.claimedBy && body.executorId !== session.claimedBy) {
      return reply.code(409).send({
        error: "acp_session_claim_mismatch"
      });
    }

    const run = await services.store.runs.getRun(session.runId);
    const checkpoint = await services.store.checkpoints.getCheckpoint(
      session.checkpointId
    );

    if (!run || !checkpoint || checkpoint.status !== "pending") {
      return reply.code(409).send({
        error: "acp_session_checkpoint_not_available"
      });
    }

    const now = services.now();
    const outputArtifactIds: string[] = [];

    for (const [index, artifactInput] of body.artifacts.entries()) {
      const artifactId = buildAcpArtifactId(session.id, index);
      outputArtifactIds.push(artifactId);
      await services.store.artifacts.writeArtifact({
        id: artifactId,
        runId: run.id,
        kind: artifactInput.kind,
        contentType: artifactInput.contentType,
        storage: artifactInput.storage,
        metadata: {
          ...artifactInput.metadata,
          sessionId: session.id,
          delegationName: session.delegationName,
          agentRef: session.agentRef,
          sourceCheckpointId: session.checkpointId
        },
        createdAt: now,
        ...(artifactInput.storage === "inline"
          ? {
              inlineData: artifactInput.inlineData
            }
          : {
              blobUri: artifactInput.blobUri
            })
      });
    }

    if (body.status === "completed" && outputArtifactIds.length > 0) {
      await persistRun(services, {
        ...run,
        inputArtifactIds: mergeArtifactIds(run.inputArtifactIds, outputArtifactIds),
        updatedAt: now
      });
    }

    const updatedSession = {
      ...session,
      status: body.status,
      outputArtifactIds,
      result: body.result,
      claimedBy: undefined,
      claimedAt: undefined,
      claimExpiresAt: undefined,
      updatedAt: now,
      resolvedAt: now
    };

    await services.store.acpSessions.upsertSession(updatedSession);
    await appendRunEvent(services, run.id, "acp.result.recorded", {
      sessionId: session.id,
      delegationName: session.delegationName,
      status: body.status,
      artifactIds: outputArtifactIds
    });

    const resolvedCheckpoint = CheckpointSchema.parse({
      ...checkpoint,
      status: "resolved",
      response: {
        status: body.status,
        sessionId: session.id,
        artifactIds: outputArtifactIds,
        result: body.result
      },
      resolvedAt: now
    });

    await services.store.checkpoints.upsertCheckpoint(resolvedCheckpoint);

    if (body.status === "failed") {
      await appendRunEvent(services, run.id, "run.failed", {
        reason: "subagent_failed",
        sessionId: session.id,
        delegationName: session.delegationName
      });
      await persistRun(services, {
        ...run,
        status: "failed",
        updatedAt: now
      });
      await services.store.engineStates.deleteState(run.id);

      return reply.code(202).send({
        accepted: true,
        session: updatedSession
      });
    }

    await services.resumeRunFromCheckpoint({
      runId: run.id,
      checkpointId: checkpoint.id,
      response: resolvedCheckpoint.response
    });

    return reply.code(202).send({
      accepted: true,
      session: updatedSession
    });
  });
};
