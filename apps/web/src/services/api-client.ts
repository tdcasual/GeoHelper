import { CommandBatch } from "@geohelper/protocol";

export type ChatMode = "byok" | "official";

export interface AgentStep {
  name: string;
  status: "ok" | "fallback" | "error" | "skipped";
  duration_ms: number;
  detail?: string;
}

export interface CompileRequest {
  message: string;
  mode: ChatMode;
  model?: string;
  sessionToken?: string;
  byokEndpoint?: string;
  byokKey?: string;
  timeoutMs?: number;
  extraHeaders?: Record<string, string>;
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

export interface CompileResponse {
  trace_id?: string;
  batch: CommandBatch;
  agent_steps?: AgentStep[];
}

export interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
  };
}

export class GatewayApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const getGatewayBaseUrl = (): string =>
  import.meta.env.VITE_GATEWAY_URL ?? "http://localhost:8787";

export const loginWithPresetToken = async (
  token: string,
  deviceId: string
): Promise<{ session_token: string; expires_in: number; token_type: string }> => {
  const response = await fetch(
    `${getGatewayBaseUrl()}/api/v1/auth/token/login`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        token,
        device_id: deviceId
      })
    }
  );

  if (!response.ok) {
    const payload = (await response
      .json()
      .catch(() => ({}))) as ApiErrorPayload;
    const code = payload.error?.code ?? "AUTH_FAILED";
    const message = payload.error?.message ?? "Authentication failed";
    throw new GatewayApiError(code, message, response.status);
  }

  return response.json();
};

export const revokeOfficialSessionToken = async (
  sessionToken: string
): Promise<void> => {
  const response = await fetch(
    `${getGatewayBaseUrl()}/api/v1/auth/token/revoke`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${sessionToken}`
      }
    }
  );

  if (!response.ok) {
    const payload = (await response
      .json()
      .catch(() => ({}))) as ApiErrorPayload;
    const code = payload.error?.code ?? "REVOKE_FAILED";
    const message = payload.error?.message ?? "Revoke failed";
    throw new GatewayApiError(code, message, response.status);
  }
};

export const compileChat = async (
  request: CompileRequest
): Promise<CompileResponse> => {
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

  const response = await fetch(`${getGatewayBaseUrl()}/api/v1/chat/compile`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      message: request.message,
      mode: request.mode,
      model: request.model,
      context: request.context
    }),
    signal: controller?.signal
  }).finally(() => {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  });

  if (!response.ok) {
    const payload = (await response
      .json()
      .catch(() => ({}))) as ApiErrorPayload;
    const code = payload.error?.code ?? "COMPILE_FAILED";
    const message = payload.error?.message ?? "Compile failed";
    throw new GatewayApiError(code, message, response.status);
  }

  return response.json();
};
