import type { BackupEnvelope } from "../storage/backup";
import { CommandBatch, type RuntimeAttachment } from "@geohelper/protocol";

export type ChatMode = "byok" | "official";
export type RuntimeTarget = "gateway" | "direct";

export interface AgentStep {
  name: string;
  status: "ok" | "fallback" | "error" | "skipped";
  duration_ms: number;
  detail?: string;
}

export interface RuntimeCapabilities {
  supportsOfficialAuth: boolean;
  supportsVision: boolean;
  supportsAgentSteps: boolean;
  supportsServerMetrics: boolean;
  supportsRateLimitHeaders: boolean;
}

export type { RuntimeAttachment };


export const runtimeCapabilitiesByTarget: Record<
  RuntimeTarget,
  RuntimeCapabilities
> = {
  gateway: {
    supportsOfficialAuth: true,
    supportsVision: false,
    supportsAgentSteps: true,
    supportsServerMetrics: true,
    supportsRateLimitHeaders: true
  },
  direct: {
    supportsOfficialAuth: false,
    supportsVision: true,
    supportsAgentSteps: false,
    supportsServerMetrics: false,
    supportsRateLimitHeaders: false
  }
};

export interface RuntimeCompileRequest {
  target: RuntimeTarget;
  baseUrl?: string;
  message: string;
  mode: ChatMode;
  model?: string;
  sessionToken?: string;
  byokEndpoint?: string;
  byokKey?: string;
  timeoutMs?: number;
  extraHeaders?: Record<string, string>;
  attachments?: RuntimeAttachment[];
  context?: {
    recentMessages?: Array<{
      role: "user" | "assistant";
      content: string;
    }>;
    sceneTransactions?: Array<{
      sceneId: string;
      transactionId: string;
      commandCount: number;
    }>;
  };
}

export interface RuntimeCompileResponse {
  trace_id?: string;
  batch: CommandBatch;
  agent_steps?: AgentStep[];
}

export interface RuntimeLoginRequest {
  target: RuntimeTarget;
  baseUrl?: string;
  token: string;
  deviceId: string;
}

export interface RuntimeLoginResponse {
  session_token: string;
  expires_in: number;
  token_type: string;
}

export interface RuntimeRevokeRequest {
  target: RuntimeTarget;
  baseUrl?: string;
  sessionToken: string;
}

export interface RuntimeBuildIdentity {
  git_sha: string | null;
  build_time: string | null;
  node_env: string;
  redis_enabled: boolean;
  attachments_enabled: boolean;
}

export interface RuntimeBackupMetadata {
  stored_at: string;
  schema_version: number;
  created_at: string;
  app_version: string;
  checksum: string;
  conversation_count: number;
}

export interface RuntimeBackupUploadRequest {
  baseUrl?: string;
  adminToken?: string;
  envelope: BackupEnvelope;
}

export interface RuntimeBackupUploadResponse {
  backup: RuntimeBackupMetadata;
  build: RuntimeBuildIdentity;
}

export interface RuntimeBackupDownloadRequest {
  baseUrl?: string;
  adminToken?: string;
}

export interface RuntimeBackupDownloadResponse {
  backup: RuntimeBackupMetadata & {
    envelope: BackupEnvelope;
  };
  build: RuntimeBuildIdentity;
}
