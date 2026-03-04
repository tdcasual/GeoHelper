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
}

export interface CompileResponse {
  trace_id?: string;
  batch: CommandBatch;
  agent_steps?: AgentStep[];
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
    throw new Error("AUTH_FAILED");
  }

  return response.json();
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

  const response = await fetch(`${getGatewayBaseUrl()}/api/v1/chat/compile`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      message: request.message,
      mode: request.mode,
      model: request.model
    })
  });

  if (!response.ok) {
    throw new Error("COMPILE_FAILED");
  }

  return response.json();
};
