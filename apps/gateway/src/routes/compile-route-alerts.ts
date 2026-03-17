import { type FastifyReply } from "fastify";

import {
  type GatewayAlertEvent,
  type GatewayAlertUpstreamContext,
  sendAlert
} from "../services/alerting";
import { type GatewayBuildInfo } from "../services/build-info";
import {
  type CompileEventSink,
  type CompileEventType,
  type CompileFinalStatus
} from "../services/compile-events";
import { type CompileMode } from "../services/litellm-client";

interface CompileAlertReply extends FastifyReply {
  geohelperAlertEvent?: GatewayAlertEvent;
}

interface CompileAlertExtras {
  detail?: string;
  error?: string;
  metadata?: Record<string, unknown>;
  upstream?: GatewayAlertUpstreamContext;
  upstreamCallCount?: number;
}

interface CreateCompileRouteAlertingParams {
  alertWebhookUrl?: string;
  buildInfo: GatewayBuildInfo;
  compileEventSink: CompileEventSink;
  getMode: () => CompileMode | undefined;
  method: string;
  path: string;
  reply: FastifyReply;
  requestId: string;
  traceId: string;
}

export const createCompileRouteAlerting = (
  params: CreateCompileRouteAlertingParams
) => {
  const writeCompileEvent = async (
    event: CompileEventType,
    finalStatus: CompileFinalStatus,
    statusCode: number,
    extras: CompileAlertExtras = {}
  ): Promise<void> => {
    await params.compileEventSink.write({
      event,
      finalStatus,
      traceId: params.traceId,
      requestId: params.requestId,
      path: params.path,
      method: params.method,
      mode: params.getMode(),
      statusCode,
      upstreamCallCount: extras.upstreamCallCount ?? 0,
      detail: extras.detail,
      metadata: extras.metadata
    });
  };

  const buildCompileOperatorAlert = (
    event: string,
    finalStatus: CompileFinalStatus,
    statusCode: number,
    extras: CompileAlertExtras = {}
  ): GatewayAlertEvent => ({
    traceId: params.traceId,
    path: params.path,
    method: params.method,
    statusCode,
    event,
    finalStatus,
    detail: extras.detail,
    error: extras.error,
    metadata: extras.metadata,
    git_sha: params.buildInfo.git_sha,
    build_time: params.buildInfo.build_time,
    node_env: params.buildInfo.node_env,
    redis_enabled: params.buildInfo.redis_enabled,
    upstream: extras.upstream
  });

  const sendCompileOperatorAlert = async (
    event: string,
    finalStatus: CompileFinalStatus,
    statusCode: number,
    extras: CompileAlertExtras = {}
  ): Promise<void> => {
    await sendAlert(
      params.alertWebhookUrl,
      buildCompileOperatorAlert(event, finalStatus, statusCode, extras)
    );
  };

  const deferCompileOperatorAlert = (
    event: string,
    finalStatus: CompileFinalStatus,
    statusCode: number,
    extras: CompileAlertExtras = {}
  ): void => {
    (params.reply as CompileAlertReply).geohelperAlertEvent =
      buildCompileOperatorAlert(event, finalStatus, statusCode, extras);
  };

  return {
    deferCompileOperatorAlert,
    sendCompileOperatorAlert,
    writeCompileEvent
  };
};
