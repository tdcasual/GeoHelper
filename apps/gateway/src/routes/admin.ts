import { compareBackupEnvelopes } from "@geohelper/protocol";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { GatewayConfig } from "../config";
import {
  GatewayBackupComparableSummary,
  GatewayBackupEnvelopeSchema,
  GatewayBackupRecord,
  GatewayBackupStore,
  GatewayBackupSummary,
  compareGatewayBackupSummaries,
  createGatewayBackupComparableSummary
} from "../services/backup-store";
import {
  GatewayBuildInfo,
  getGatewayBuildIdentity
} from "../services/build-info";
import {
  CompileEventSink,
  CompileFinalStatus,
  readCompileTraceDetails,
  readRecentCompileEvents
} from "../services/compile-events";
import { getGatewayMetricsSnapshot } from "../services/metrics";
import { GatewayMetricsStore } from "../services/metrics-store";

interface AdminRouteDeps {
  metricsStore: GatewayMetricsStore;
  compileEventSink: CompileEventSink;
  buildInfo: GatewayBuildInfo;
  backupStore: GatewayBackupStore;
}

const AdminCompileEventsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  traceId: z.string().trim().min(1).optional(),
  requestId: z.string().trim().min(1).optional(),
  mode: z.string().trim().min(1).optional(),
  finalStatus: z.enum([
    "success",
    "fallback",
    "repair",
    "validation_failure",
    "upstream_failure"
  ] satisfies CompileFinalStatus[]).optional(),
  since: z.string().trim().min(1).optional()
});

const AdminBackupHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional()
});

const GatewayBackupCompareSummarySchema = z
  .object({
    schema_version: z.number().int().positive(),
    created_at: z.string().trim().min(1),
    updated_at: z.string().trim().min(1),
    app_version: z.string().trim().min(1),
    checksum: z.string().trim().min(1),
    conversation_count: z.number().int().nonnegative(),
    snapshot_id: z.string().trim().min(1),
    device_id: z.string().trim().min(1),
    base_snapshot_id: z.string().trim().min(1).optional()
  })
  .strict();

const AdminBackupCompareRequestSchema = z
  .object({
    local_envelope: GatewayBackupEnvelopeSchema.optional(),
    local_summary: GatewayBackupCompareSummarySchema.optional()
  })
  .strict()
  .refine(
    (value) => Number(Boolean(value.local_envelope)) + Number(Boolean(value.local_summary)) === 1,
    {
      message: "Exactly one of local_envelope or local_summary is required"
    }
  );

const requireAdminToken = (
  request: FastifyRequest,
  reply: FastifyReply,
  config: GatewayConfig
): boolean => {
  if (!config.adminMetricsToken) {
    return true;
  }

  const token = request.headers["x-admin-token"];
  if (token === config.adminMetricsToken) {
    return true;
  }

  reply.status(403).send({
    error: {
      code: "FORBIDDEN",
      message: "Admin token is invalid"
    }
  });
  return false;
};

const serializeBackupSummary = (summary: GatewayBackupSummary) => ({
  stored_at: summary.storedAt,
  schema_version: summary.schemaVersion,
  created_at: summary.createdAt,
  updated_at: summary.updatedAt,
  app_version: summary.appVersion,
  checksum: summary.checksum,
  conversation_count: summary.conversationCount,
  snapshot_id: summary.snapshotId,
  device_id: summary.deviceId,
  ...(summary.baseSnapshotId ? { base_snapshot_id: summary.baseSnapshotId } : {})
});

const serializeComparableSummary = (summary: GatewayBackupComparableSummary) => ({
  schema_version: summary.schemaVersion,
  created_at: summary.createdAt,
  updated_at: summary.updatedAt,
  app_version: summary.appVersion,
  checksum: summary.checksum,
  conversation_count: summary.conversationCount,
  snapshot_id: summary.snapshotId,
  device_id: summary.deviceId,
  ...(summary.baseSnapshotId ? { base_snapshot_id: summary.baseSnapshotId } : {})
});

const serializeBackupRecord = (record: GatewayBackupRecord) => ({
  ...serializeBackupSummary(record),
  envelope: record.envelope
});

const createBackupResponse = (
  backup: ReturnType<typeof serializeBackupSummary> | ReturnType<typeof serializeBackupRecord>,
  buildInfo: GatewayBuildInfo
) => ({
  backup,
  build: getGatewayBuildIdentity(buildInfo)
});

const parseComparableSummaryInput = (
  summary: z.infer<typeof GatewayBackupCompareSummarySchema>
): GatewayBackupComparableSummary => ({
  checksum: summary.checksum,
  schemaVersion: summary.schema_version,
  createdAt: summary.created_at,
  updatedAt: summary.updated_at,
  appVersion: summary.app_version,
  conversationCount: summary.conversation_count,
  snapshotId: summary.snapshot_id,
  deviceId: summary.device_id,
  ...(summary.base_snapshot_id ? { baseSnapshotId: summary.base_snapshot_id } : {})
});

export const registerAdminRoutes = (
  app: FastifyInstance,
  config: GatewayConfig,
  deps: AdminRouteDeps
): void => {
  app.put("/admin/backups/latest", async (request, reply) => {
    if (!requireAdminToken(request, reply, config)) {
      return reply;
    }

    const parsed = GatewayBackupEnvelopeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: "INVALID_BACKUP_ENVELOPE",
          message: "Backup envelope is invalid"
        }
      });
    }

    const summary = await deps.backupStore.writeLatest(parsed.data);

    return reply.send(createBackupResponse(serializeBackupSummary(summary), deps.buildInfo));
  });

  app.get("/admin/backups/latest", async (request, reply) => {
    if (!requireAdminToken(request, reply, config)) {
      return reply;
    }

    const latest = await deps.backupStore.readLatest();
    if (!latest) {
      return reply.status(404).send({
        error: {
          code: "BACKUP_NOT_FOUND",
          message: "Backup was not found"
        }
      });
    }

    return reply.send(createBackupResponse(serializeBackupRecord(latest), deps.buildInfo));
  });

  app.get("/admin/backups/history", async (request, reply) => {
    if (!requireAdminToken(request, reply, config)) {
      return reply;
    }

    const parsed = AdminBackupHistoryQuerySchema.safeParse(request.query);
    const limit = parsed.success ? parsed.data.limit : undefined;
    const history = await deps.backupStore.readHistory(limit);

    return reply.send({
      history: history.map((entry) => serializeBackupSummary(entry)),
      build: getGatewayBuildIdentity(deps.buildInfo)
    });
  });

  app.post("/admin/backups/compare", async (request, reply) => {
    if (!requireAdminToken(request, reply, config)) {
      return reply;
    }

    const parsed = AdminBackupCompareRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: "INVALID_BACKUP_COMPARE_REQUEST",
          message: "Backup compare request is invalid"
        }
      });
    }

    const latest = await deps.backupStore.readLatest();
    const localStatus = parsed.data.local_envelope ? "envelope" : "summary";
    const localSummary = parsed.data.local_envelope
      ? createGatewayBackupComparableSummary(parsed.data.local_envelope)
      : parseComparableSummaryInput(parsed.data.local_summary!);

    const comparisonResult = !latest
      ? "local_newer"
      : parsed.data.local_envelope
        ? compareBackupEnvelopes(parsed.data.local_envelope, latest.envelope).relation
        : compareGatewayBackupSummaries(localSummary, latest).relation;

    return reply.send({
      local_status: localStatus,
      remote_status: latest ? "available" : "missing",
      comparison_result: comparisonResult,
      local_snapshot: {
        summary: serializeComparableSummary(localSummary)
      },
      remote_snapshot: latest
        ? {
            summary: serializeBackupSummary(latest)
          }
        : null,
      build: getGatewayBuildIdentity(deps.buildInfo)
    });
  });

  app.get("/admin/metrics", async (request, reply) => {
    if (!requireAdminToken(request, reply, config)) {
      return reply;
    }

    return reply.send(getGatewayMetricsSnapshot(deps.metricsStore));
  });

  app.get("/admin/version", async (request, reply) => {
    if (!requireAdminToken(request, reply, config)) {
      return reply;
    }

    return reply.send(getGatewayBuildIdentity(deps.buildInfo));
  });

  app.get("/admin/compile-events", async (request, reply) => {
    if (!requireAdminToken(request, reply, config)) {
      return reply;
    }

    const parsed = AdminCompileEventsQuerySchema.safeParse(request.query);
    const query = parsed.success
      ? {
          limit: parsed.data.limit ?? 20,
          traceId: parsed.data.traceId,
          requestId: parsed.data.requestId,
          mode: parsed.data.mode,
          finalStatus: parsed.data.finalStatus,
          since: parsed.data.since
        }
      : { limit: 20 };
    const events = await readRecentCompileEvents(deps.compileEventSink, query);

    return reply.send({ events });
  });

  app.get("/admin/traces/:traceId", async (request, reply) => {
    if (!requireAdminToken(request, reply, config)) {
      return reply;
    }

    const params = request.params as { traceId?: string };
    const trace = await readCompileTraceDetails(
      deps.compileEventSink,
      params.traceId ?? ""
    );

    if (!trace) {
      return reply.status(404).send({
        error: {
          code: "TRACE_NOT_FOUND",
          message: "Trace was not found"
        }
      });
    }

    return reply.send(trace);
  });
};
