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

const VISION_MODEL_MARKERS = [
  "gpt-4o",
  "claude-3",
  "gemini",
  "vision",
  "vl"
] as const;

export const inferModelSupportsVision = (model?: string): boolean => {
  const normalized = (model ?? "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (/(^|[-_/])mini($|[-_/])/.test(normalized) && !normalized.includes("vision")) {
    return false;
  }

  return VISION_MODEL_MARKERS.some((marker) => normalized.includes(marker));
};

export const resolveRuntimeCapabilitiesForModel = (params: {
  runtimeTarget: RuntimeTarget;
  model?: string;
}): RuntimeCapabilities => {
  const base = runtimeCapabilitiesByTarget[params.runtimeTarget];
  if (params.runtimeTarget !== "direct") {
    return {
      ...base
    };
  }

  return {
    ...base,
    supportsVision: base.supportsVision && inferModelSupportsVision(params.model)
  };
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

export interface RuntimeBackupComparableSummary {
  schema_version: number;
  created_at: string;
  updated_at: string;
  app_version: string;
  checksum: string;
  conversation_count: number;
  snapshot_id: string;
  device_id: string;
  base_snapshot_id?: string;
}

export interface RuntimeBackupMetadata extends RuntimeBackupComparableSummary {
  stored_at: string;
}

export type RuntimeBackupLocalStatus = "summary" | "envelope";
export type RuntimeBackupRemoteStatus = "available" | "missing";
export type RuntimeBackupComparisonResult =
  | "identical"
  | "local_newer"
  | "remote_newer"
  | "diverged";
export type RemoteBackupSyncStatus =
  | "idle"
  | "checking"
  | "up_to_date"
  | "local_newer"
  | "remote_newer"
  | "diverged";

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

export interface RuntimeBackupHistoryRequest {
  baseUrl?: string;
  adminToken?: string;
  limit?: number;
}

export interface RuntimeBackupHistoryResponse {
  history: RuntimeBackupMetadata[];
  build: RuntimeBuildIdentity;
}

export interface RuntimeBackupLatestMetadataRequest {
  baseUrl?: string;
  adminToken?: string;
}

export interface RuntimeBackupLatestMetadataResponse {
  backup: RuntimeBackupMetadata | null;
  build: RuntimeBuildIdentity;
}

export interface RuntimeBackupCompareRequest {
  baseUrl?: string;
  adminToken?: string;
  localSummary: RuntimeBackupComparableSummary;
}

export interface RuntimeBackupCompareResponse {
  local_status: RuntimeBackupLocalStatus;
  remote_status: RuntimeBackupRemoteStatus;
  comparison_result: RuntimeBackupComparisonResult;
  local_snapshot: {
    summary: RuntimeBackupComparableSummary;
  };
  remote_snapshot: {
    summary: RuntimeBackupMetadata;
  } | null;
  build: RuntimeBuildIdentity;
}
