import { RuntimeApiError, RuntimeClient } from "./orchestrator";
import { verifyCommandBatch } from "./compile-pipeline";
import {
  RuntimeBackupCompareRequest,
  RuntimeBackupCompareResponse,
  RuntimeBackupDownloadRequest,
  RuntimeBackupDownloadResponse,
  RuntimeBackupGuardedUploadConflictResponse,
  RuntimeBackupGuardedUploadRequest,
  RuntimeBackupGuardedUploadResponse,
  RuntimeBackupHistoryRequest,
  RuntimeBackupHistoryResponse,
  RuntimeBackupProtectionRequest,
  RuntimeBackupProtectResponse,
  RuntimeBackupLatestMetadataRequest,
  RuntimeBackupLatestMetadataResponse,
  RuntimeBackupUnprotectResponse,
  RuntimeBackupUploadRequest,
  RuntimeBackupUploadResponse,
  RuntimeBuildIdentity,
  RuntimeCapabilities
} from "./types";

const gatewayCapabilities: RuntimeCapabilities = {
  supportsOfficialAuth: true,
  supportsVision: false,
  supportsAgentSteps: true,
  supportsServerMetrics: true,
  supportsRateLimitHeaders: true
};

interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
  };
}

export interface GatewayRuntimeClient extends RuntimeClient {
  uploadBackup: (
    request: RuntimeBackupUploadRequest
  ) => Promise<RuntimeBackupUploadResponse>;
  uploadBackupGuarded: (
    request: RuntimeBackupGuardedUploadRequest
  ) => Promise<RuntimeBackupGuardedUploadResponse>;
  downloadBackup: (
    request: RuntimeBackupDownloadRequest
  ) => Promise<RuntimeBackupDownloadResponse>;
  fetchBackupHistory: (
    request: RuntimeBackupHistoryRequest
  ) => Promise<RuntimeBackupHistoryResponse>;
  protectBackupSnapshot: (
    request: RuntimeBackupProtectionRequest
  ) => Promise<RuntimeBackupProtectResponse>;
  unprotectBackupSnapshot: (
    request: RuntimeBackupProtectionRequest
  ) => Promise<RuntimeBackupUnprotectResponse>;
  fetchLatestBackupMetadata: (
    request: RuntimeBackupLatestMetadataRequest
  ) => Promise<RuntimeBackupLatestMetadataResponse>;
  compareBackup: (
    request: RuntimeBackupCompareRequest
  ) => Promise<RuntimeBackupCompareResponse>;
  resolveCapabilities: (params?: {
    baseUrl?: string;
    model?: string;
  }) => Promise<RuntimeCapabilities>;
}

const readGatewayBaseUrlFromEnv = (): string | undefined => {
  const viteValue =
    typeof import.meta !== "undefined" && import.meta.env
      ? import.meta.env.VITE_GATEWAY_URL
      : undefined;
  const processValue =
    typeof globalThis !== "undefined" &&
    "process" in globalThis &&
    (
      globalThis as {
        process?: {
          env?: {
            VITE_GATEWAY_URL?: string;
          };
        };
      }
    ).process?.env?.VITE_GATEWAY_URL;
  const value = viteValue ?? processValue;
  return typeof value === "string" ? value : undefined;
};

const resolveGatewayBaseUrl = (raw?: string): string => {
  const candidate = (raw ?? readGatewayBaseUrlFromEnv() ?? "").trim();
  return candidate.replace(/\/+$/, "");
};

const parseApiError = async (
  response: Response,
  fallbackCode: string,
  fallbackMessage: string
): Promise<never> => {
  const payload = (await response
    .json()
    .catch(() => ({}))) as ApiErrorPayload;
  throw new RuntimeApiError(
    payload.error?.code ?? fallbackCode,
    payload.error?.message ?? fallbackMessage,
    response.status
  );
};

const buildAdminHeaders = (
  adminToken?: string,
  includeContentType = false
): Record<string, string> => {
  const headers: Record<string, string> = {};

  if (includeContentType) {
    headers["content-type"] = "application/json";
  }
  if (adminToken) {
    headers["x-admin-token"] = adminToken;
  }

  return headers;
};

const buildGatewayCapabilities = (
  identity?: RuntimeBuildIdentity | null
): RuntimeCapabilities => ({
  ...gatewayCapabilities,
  supportsVision: Boolean(identity?.attachments_enabled)
});

const buildHistoryUrl = (baseUrl: string, limit?: number): string => {
  const params = new URLSearchParams();
  if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
    params.set("limit", String(Math.floor(limit)));
  }

  const query = params.toString();
  return `${baseUrl}/admin/backups/history${query ? `?${query}` : ""}`;
};

const buildBackupDownloadUrl = (
  baseUrl: string,
  snapshotId?: string
): string => {
  const normalizedSnapshotId = snapshotId?.trim();
  if (!normalizedSnapshotId) {
    return `${baseUrl}/admin/backups/latest`;
  }

  return `${baseUrl}/admin/backups/history/${encodeURIComponent(normalizedSnapshotId)}`;
};

const buildBackupProtectUrl = (baseUrl: string, snapshotId: string): string =>
  `${buildBackupDownloadUrl(baseUrl, snapshotId)}/protect`;

export const createGatewayClient = (): GatewayRuntimeClient => {
  const capabilityCache = new Map<string, RuntimeCapabilities>();

  const resolveRuntimeIdentity = async (
    baseUrl?: string
  ): Promise<RuntimeBuildIdentity | null> => {
    const resolvedBaseUrl = resolveGatewayBaseUrl(baseUrl);

    try {
      const response = await fetch(`${resolvedBaseUrl}/admin/version`, {
        method: "GET"
      });
      if (!response.ok) {
        return null;
      }

      return (await response.json()) as RuntimeBuildIdentity;
    } catch {
      return null;
    }
  };

  const resolveCapabilities = async (params?: {
    baseUrl?: string;
    model?: string;
  }): Promise<RuntimeCapabilities> => {
    const cacheKey = resolveGatewayBaseUrl(params?.baseUrl);
    const cached = capabilityCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const identity = await resolveRuntimeIdentity(cacheKey);
    const capabilities = buildGatewayCapabilities(identity);
    if (identity) {
      capabilityCache.set(cacheKey, capabilities);
    }
    return capabilities;
  };

  const fetchBackupHistory = async (
    request: RuntimeBackupHistoryRequest
  ): Promise<RuntimeBackupHistoryResponse> => {
    const baseUrl = resolveGatewayBaseUrl(request.baseUrl);
    const response = await fetch(buildHistoryUrl(baseUrl, request.limit), {
      method: "GET",
      headers: buildAdminHeaders(request.adminToken)
    });

    if (!response.ok) {
      return parseApiError(
        response,
        "REMOTE_BACKUP_HISTORY_FAILED",
        "Remote backup history failed"
      );
    }

    return response.json() as Promise<RuntimeBackupHistoryResponse>;
  };

  const fetchLatestBackupMetadata = async (
    request: RuntimeBackupLatestMetadataRequest
  ): Promise<RuntimeBackupLatestMetadataResponse> => {
    const response = await fetchBackupHistory({
      ...request,
      limit: 1
    });

    return {
      backup: response.history[0] ?? null,
      build: response.build
    };
  };

  const protectBackupSnapshot = async (
    request: RuntimeBackupProtectionRequest
  ): Promise<RuntimeBackupProtectResponse> => {
    const baseUrl = resolveGatewayBaseUrl(request.baseUrl);
    const response = await fetch(buildBackupProtectUrl(baseUrl, request.snapshotId), {
      method: "POST",
      headers: buildAdminHeaders(request.adminToken)
    });

    if (response.status === 409) {
      return response.json() as Promise<RuntimeBackupProtectResponse>;
    }

    if (!response.ok) {
      return parseApiError(
        response,
        "REMOTE_BACKUP_PROTECT_FAILED",
        "Remote backup protect failed"
      );
    }

    return response.json() as Promise<RuntimeBackupProtectResponse>;
  };

  const unprotectBackupSnapshot = async (
    request: RuntimeBackupProtectionRequest
  ): Promise<RuntimeBackupUnprotectResponse> => {
    const baseUrl = resolveGatewayBaseUrl(request.baseUrl);
    const response = await fetch(buildBackupProtectUrl(baseUrl, request.snapshotId), {
      method: "DELETE",
      headers: buildAdminHeaders(request.adminToken)
    });

    if (!response.ok) {
      return parseApiError(
        response,
        "REMOTE_BACKUP_UNPROTECT_FAILED",
        "Remote backup unprotect failed"
      );
    }

    return response.json() as Promise<RuntimeBackupUnprotectResponse>;
  };

  const compareBackup = async (
    request: RuntimeBackupCompareRequest
  ): Promise<RuntimeBackupCompareResponse> => {
    const baseUrl = resolveGatewayBaseUrl(request.baseUrl);
    const response = await fetch(`${baseUrl}/admin/backups/compare`, {
      method: "POST",
      headers: buildAdminHeaders(request.adminToken, true),
      body: JSON.stringify({
        local_summary: request.localSummary
      })
    });

    if (!response.ok) {
      return parseApiError(
        response,
        "REMOTE_BACKUP_COMPARE_FAILED",
        "Remote backup compare failed"
      );
    }

    return response.json() as Promise<RuntimeBackupCompareResponse>;
  };

  return {
    target: "gateway",
    capabilities: gatewayCapabilities,
    resolveCapabilities,

    compile: async (request) => {
      const baseUrl = resolveGatewayBaseUrl(request.baseUrl);
      const headers: Record<string, string> = {
        "content-type": "application/json"
      };

      if (request.mode === "official" && request.sessionToken) {
        headers.authorization = `Bearer ${request.sessionToken}`;
      }
      if (request.byokEndpoint) {
        headers["x-byok-endpoint"] = request.byokEndpoint;
      }
      if (request.byokKey) {
        headers["x-byok-key"] = request.byokKey;
      }
      if (request.extraHeaders) {
        Object.assign(headers, request.extraHeaders);
      }

      const controller =
        typeof AbortController !== "undefined" ? new AbortController() : undefined;
      const timeoutHandle =
        controller && request.timeoutMs && request.timeoutMs > 0
          ? setTimeout(() => controller.abort(), request.timeoutMs)
          : undefined;

      const response = await fetch(`${baseUrl}/api/v1/chat/compile`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: request.message,
          mode: request.mode,
          model: request.model,
          attachments: request.attachments,
          context: request.context
        }),
        signal: controller?.signal
      }).finally(() => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
      });

      if (!response.ok) {
        return parseApiError(response, "COMPILE_FAILED", "Compile failed");
      }

      const payload = (await response.json()) as {
        trace_id?: string;
        batch: unknown;
        agent_steps?: Array<{
          name: string;
          status: "ok" | "fallback" | "error" | "skipped";
          duration_ms: number;
          detail?: string;
        }>;
      };

      return {
        trace_id: payload.trace_id,
        batch: verifyCommandBatch(payload.batch),
        agent_steps: payload.agent_steps
      };
    },

    uploadBackup: async (request) => {
      const baseUrl = resolveGatewayBaseUrl(request.baseUrl);
      const response = await fetch(`${baseUrl}/admin/backups/latest`, {
        method: "PUT",
        headers: buildAdminHeaders(request.adminToken, true),
        body: JSON.stringify(request.envelope)
      });

      if (!response.ok) {
        return parseApiError(
          response,
          "REMOTE_BACKUP_UPLOAD_FAILED",
          "Remote backup upload failed"
        );
      }

      return response.json() as Promise<RuntimeBackupUploadResponse>;
    },

    uploadBackupGuarded: async (request) => {
      const baseUrl = resolveGatewayBaseUrl(request.baseUrl);
      const response = await fetch(`${baseUrl}/admin/backups/guarded`, {
        method: "POST",
        headers: buildAdminHeaders(request.adminToken, true),
        body: JSON.stringify({
          envelope: request.envelope,
          expected_remote_snapshot_id: request.expectedRemoteSnapshotId ?? null,
          ...(request.expectedRemoteChecksum !== undefined
            ? {
                expected_remote_checksum: request.expectedRemoteChecksum
              }
            : {})
        })
      });

      if (response.status === 409) {
        return response.json() as Promise<RuntimeBackupGuardedUploadConflictResponse>;
      }

      if (!response.ok) {
        return parseApiError(
          response,
          "REMOTE_BACKUP_GUARDED_UPLOAD_FAILED",
          "Remote backup guarded upload failed"
        );
      }

      return response.json() as Promise<RuntimeBackupGuardedUploadResponse>;
    },

    downloadBackup: async (request) => {
      const baseUrl = resolveGatewayBaseUrl(request.baseUrl);
      const response = await fetch(buildBackupDownloadUrl(baseUrl, request.snapshotId), {
        method: "GET",
        headers: buildAdminHeaders(request.adminToken)
      });

      if (!response.ok) {
        return parseApiError(
          response,
          "REMOTE_BACKUP_DOWNLOAD_FAILED",
          "Remote backup download failed"
        );
      }

      return response.json() as Promise<RuntimeBackupDownloadResponse>;
    },

    fetchBackupHistory,
    protectBackupSnapshot,
    unprotectBackupSnapshot,
    fetchLatestBackupMetadata,
    compareBackup,

    loginWithPresetToken: async (request) => {
      const baseUrl = resolveGatewayBaseUrl(request.baseUrl);
      const response = await fetch(`${baseUrl}/api/v1/auth/token/login`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          token: request.token,
          device_id: request.deviceId
        })
      });

      if (!response.ok) {
        return parseApiError(response, "AUTH_FAILED", "Authentication failed");
      }

      return response.json() as Promise<{
        session_token: string;
        expires_in: number;
        token_type: string;
      }>;
    },

    revokeOfficialSessionToken: async (request) => {
      const baseUrl = resolveGatewayBaseUrl(request.baseUrl);
      const response = await fetch(`${baseUrl}/api/v1/auth/token/revoke`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${request.sessionToken}`
        }
      });

      if (!response.ok) {
        return parseApiError(response, "REVOKE_FAILED", "Revoke failed");
      }
    }
  };
};
