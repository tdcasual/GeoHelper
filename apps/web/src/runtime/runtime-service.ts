import {
  resolveRuntimeCapabilitiesForModel,
  RuntimeBackupCompareRequest,
  RuntimeBackupCompareResponse,
  RuntimeBackupDownloadRequest,
  RuntimeBackupDownloadResponse,
  RuntimeBackupGuardedUploadRequest,
  RuntimeBackupGuardedUploadResponse,
  RuntimeBackupHistoryRequest,
  RuntimeBackupHistoryResponse,
  RuntimeBackupLatestMetadataRequest,
  RuntimeBackupLatestMetadataResponse,
  RuntimeBackupProtectionRequest,
  RuntimeBackupProtectResponse,
  RuntimeBackupUnprotectResponse,
  RuntimeBackupUploadRequest,
  RuntimeBackupUploadResponse,
  RuntimeCapabilities,
  RuntimeLoginRequest,
  RuntimeLoginResponse,
  RuntimeRevokeRequest,
  RuntimeTarget} from "./types";

const normalizeBaseUrl = (baseUrl = ""): string => baseUrl.replace(/\/+$/, "");

export class RuntimeApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const parseErrorPayload = async (response: Response): Promise<RuntimeApiError> => {
  try {
    const payload = (await response.json()) as {
      error?:
        | {
            code?: string;
            message?: string;
          }
        | string;
      message?: string;
    };

    if (typeof payload.error === "string") {
      return new RuntimeApiError(payload.error, payload.error, response.status);
    }

    if (payload.error?.code || payload.error?.message) {
      return new RuntimeApiError(
        payload.error.code ?? "RUNTIME_REQUEST_FAILED",
        payload.error.message ?? "Runtime request failed",
        response.status
      );
    }

    if (payload.message) {
      return new RuntimeApiError(
        "RUNTIME_REQUEST_FAILED",
        payload.message,
        response.status
      );
    }
  } catch {
    // Ignore parse failures and fall back to the HTTP status text below.
  }

  return new RuntimeApiError(
    "RUNTIME_REQUEST_FAILED",
    response.statusText || "Runtime request failed",
    response.status
  );
};

const requestJson = async <T>(
  input: string,
  init: RequestInit = {}
): Promise<T> => {
  const response = await fetch(input, init);
  if (!response.ok) {
    throw await parseErrorPayload(response);
  }

  return (await response.json()) as T;
};

const requestJsonAllowStatuses = async <T>(
  input: string,
  init: RequestInit = {},
  allowedStatuses: number[] = []
): Promise<T> => {
  const response = await fetch(input, init);
  if (!response.ok && !allowedStatuses.includes(response.status)) {
    throw await parseErrorPayload(response);
  }

  return (await response.json()) as T;
};

export type {
  RuntimeBackupCompareRequest,
  RuntimeBackupCompareResponse,
  RuntimeBackupDownloadRequest,
  RuntimeBackupDownloadResponse,
  RuntimeBackupGuardedUploadRequest,
  RuntimeBackupGuardedUploadResponse,
  RuntimeBackupHistoryRequest,
  RuntimeBackupHistoryResponse,
  RuntimeBackupLatestMetadataRequest,
  RuntimeBackupLatestMetadataResponse,
  RuntimeBackupProtectionRequest,
  RuntimeBackupProtectResponse,
  RuntimeBackupUnprotectResponse,
  RuntimeBackupUploadRequest,
  RuntimeBackupUploadResponse,
  RuntimeCapabilities,
  RuntimeLoginRequest,
  RuntimeLoginResponse,
  RuntimeRevokeRequest,
  RuntimeTarget
};

export const getRuntimeCapabilities = (
  runtimeTarget: RuntimeTarget
): RuntimeCapabilities =>
  resolveRuntimeCapabilitiesForModel({
    runtimeTarget
  });

export const resolveRuntimeCapabilities = async (params: {
  target: RuntimeTarget;
  baseUrl?: string;
  model?: string;
}): Promise<RuntimeCapabilities> =>
  resolveRuntimeCapabilitiesForModel({
    runtimeTarget: params.target,
    model: params.model
  });

export const loginWithRuntime = async (
  request: RuntimeLoginRequest
): Promise<RuntimeLoginResponse> => {
  if (request.target !== "gateway") {
    throw new RuntimeApiError(
      "RUNTIME_AUTH_UNSUPPORTED",
      `Runtime target "${request.target}" does not support preset token login`,
      400
    );
  }

  const baseUrl = normalizeBaseUrl(request.baseUrl);
  return requestJson<RuntimeLoginResponse>(`${baseUrl}/api/v1/auth/token/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      token: request.token,
      device_id: request.deviceId
    })
  });
};

export const revokeRuntimeSession = async (
  request: RuntimeRevokeRequest
): Promise<void> => {
  if (request.target !== "gateway") {
    throw new RuntimeApiError(
      "RUNTIME_AUTH_UNSUPPORTED",
      `Runtime target "${request.target}" does not support revoke`,
      400
    );
  }

  const baseUrl = normalizeBaseUrl(request.baseUrl);
  await requestJson(`${baseUrl}/api/v1/auth/token/revoke`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${request.sessionToken}`
    }
  });
};

export const uploadGatewayBackup = async (
  request: RuntimeBackupUploadRequest
): Promise<RuntimeBackupUploadResponse> => {
  const baseUrl = normalizeBaseUrl(request.baseUrl);
  return requestJson<RuntimeBackupUploadResponse>(`${baseUrl}/admin/backups/latest`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      ...(request.adminToken ? { "x-admin-token": request.adminToken } : {})
    },
    body: JSON.stringify(request.envelope)
  });
};

export const uploadGatewayBackupGuarded = async (
  request: RuntimeBackupGuardedUploadRequest
): Promise<RuntimeBackupGuardedUploadResponse> => {
  const baseUrl = normalizeBaseUrl(request.baseUrl);
  return requestJsonAllowStatuses<RuntimeBackupGuardedUploadResponse>(
    `${baseUrl}/admin/backups/guarded`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(request.adminToken ? { "x-admin-token": request.adminToken } : {})
      },
      body: JSON.stringify({
        envelope: request.envelope,
        expected_remote_snapshot_id: request.expectedRemoteSnapshotId ?? null,
        expected_remote_checksum: request.expectedRemoteChecksum ?? null
      })
    },
    [409]
  );
};

export const downloadGatewayBackup = async (
  request: RuntimeBackupDownloadRequest
): Promise<RuntimeBackupDownloadResponse> => {
  const baseUrl = normalizeBaseUrl(request.baseUrl);
  const suffix = request.snapshotId
    ? `/admin/backups/history/${encodeURIComponent(request.snapshotId)}`
    : "/admin/backups/latest";

  return requestJson<RuntimeBackupDownloadResponse>(`${baseUrl}${suffix}`, {
    headers: {
      ...(request.adminToken ? { "x-admin-token": request.adminToken } : {})
    }
  });
};

export const fetchGatewayBackupHistory = async (
  request: RuntimeBackupHistoryRequest
): Promise<RuntimeBackupHistoryResponse> => {
  const baseUrl = normalizeBaseUrl(request.baseUrl);
  const url = new URL("/admin/backups/history", baseUrl || "http://localhost");
  if (request.limit) {
    url.searchParams.set("limit", String(request.limit));
  }

  return requestJson<RuntimeBackupHistoryResponse>(
    baseUrl ? url.toString() : `${url.pathname}${url.search}`,
    {
      headers: {
        ...(request.adminToken ? { "x-admin-token": request.adminToken } : {})
      }
    }
  );
};

export const fetchGatewayLatestBackupMetadata = async (
  request: RuntimeBackupLatestMetadataRequest
): Promise<RuntimeBackupLatestMetadataResponse> => {
  const response = await downloadGatewayBackup({
    baseUrl: request.baseUrl,
    adminToken: request.adminToken
  }).catch((error) => {
    if (error instanceof RuntimeApiError && error.status === 404) {
      return {
        backup: null,
        build: {
          git_sha: null,
          build_time: null,
          node_env: "unknown",
          redis_enabled: false,
          attachments_enabled: false
        }
      } satisfies RuntimeBackupLatestMetadataResponse;
    }

    throw error;
  });

  return {
    backup: response.backup
      ? {
          ...response.backup,
          envelope: undefined
        }
      : null,
    build: response.build
  } as RuntimeBackupLatestMetadataResponse;
};

export const protectGatewayBackupSnapshot = async (
  request: RuntimeBackupProtectionRequest
): Promise<RuntimeBackupProtectResponse> => {
  const baseUrl = normalizeBaseUrl(request.baseUrl);
  return requestJsonAllowStatuses<RuntimeBackupProtectResponse>(
    `${baseUrl}/admin/backups/history/${encodeURIComponent(
      request.snapshotId
    )}/protect`,
    {
      method: "POST",
      headers: {
        ...(request.adminToken ? { "x-admin-token": request.adminToken } : {})
      }
    },
    [409]
  );
};

export const unprotectGatewayBackupSnapshot = async (
  request: RuntimeBackupProtectionRequest
): Promise<RuntimeBackupUnprotectResponse> => {
  const baseUrl = normalizeBaseUrl(request.baseUrl);
  return requestJson<RuntimeBackupUnprotectResponse>(
    `${baseUrl}/admin/backups/history/${encodeURIComponent(
      request.snapshotId
    )}/protect`,
    {
      method: "DELETE",
      headers: {
        ...(request.adminToken ? { "x-admin-token": request.adminToken } : {})
      }
    }
  );
};

export const compareGatewayBackup = async (
  request: RuntimeBackupCompareRequest
): Promise<RuntimeBackupCompareResponse> => {
  const baseUrl = normalizeBaseUrl(request.baseUrl);
  return requestJson<RuntimeBackupCompareResponse>(`${baseUrl}/admin/backups/compare`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(request.adminToken ? { "x-admin-token": request.adminToken } : {})
    },
    body: JSON.stringify({
      local_summary: request.localSummary
    })
  });
};
