import { RuntimeApiError, RuntimeClient } from "./orchestrator";
import { verifyCommandBatch } from "./compile-pipeline";
import {
  RuntimeBackupDownloadRequest,
  RuntimeBackupDownloadResponse,
  RuntimeBackupUploadRequest,
  RuntimeBackupUploadResponse
} from "./types";

const gatewayCapabilities = {
  supportsOfficialAuth: true,
  supportsVision: false,
  supportsAgentSteps: true,
  supportsServerMetrics: true,
  supportsRateLimitHeaders: true
} as const;

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
  downloadBackup: (
    request: RuntimeBackupDownloadRequest
  ) => Promise<RuntimeBackupDownloadResponse>;
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

export const createGatewayClient = (): GatewayRuntimeClient => ({
  target: "gateway",
  capabilities: gatewayCapabilities,

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

  downloadBackup: async (request) => {
    const baseUrl = resolveGatewayBaseUrl(request.baseUrl);
    const response = await fetch(`${baseUrl}/admin/backups/latest`, {
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
});
