import { createDirectClient } from "../runtime/direct-client";
import { createGatewayClient } from "../runtime/gateway-client";
import {
  createRuntimeOrchestrator,
  RuntimeApiError
} from "../runtime/orchestrator";
import {
  AgentStep,
  ChatMode,
  RuntimeCapabilities,
  RuntimeCompileResponse,
  RuntimeTarget
} from "../runtime/types";

const runtimeOrchestrator = createRuntimeOrchestrator({
  gateway: createGatewayClient(),
  direct: createDirectClient()
});

export type { AgentStep, ChatMode, RuntimeTarget, RuntimeCapabilities };

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
  runtimeTarget?: RuntimeTarget;
  runtimeBaseUrl?: string;
}

export type CompileResponse = RuntimeCompileResponse;

export class GatewayApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const toGatewayError = (
  error: unknown,
  fallbackCode: string,
  fallbackMessage: string,
  fallbackStatus: number
): GatewayApiError => {
  if (error instanceof GatewayApiError) {
    return error;
  }

  if (error instanceof RuntimeApiError) {
    return new GatewayApiError(error.code, error.message, error.status);
  }

  if (error instanceof Error) {
    return new GatewayApiError(fallbackCode, error.message, fallbackStatus);
  }

  return new GatewayApiError(fallbackCode, fallbackMessage, fallbackStatus);
};

export const getRuntimeCapabilities = (
  runtimeTarget: RuntimeTarget
): RuntimeCapabilities => runtimeOrchestrator.getCapabilities(runtimeTarget);

export const loginWithPresetToken = async (
  token: string,
  deviceId: string,
  options?: {
    runtimeTarget?: RuntimeTarget;
    runtimeBaseUrl?: string;
  }
): Promise<{ session_token: string; expires_in: number; token_type: string }> => {
  try {
    return await runtimeOrchestrator.loginWithPresetToken({
      target: options?.runtimeTarget ?? "gateway",
      baseUrl: options?.runtimeBaseUrl,
      token,
      deviceId
    });
  } catch (error) {
    throw toGatewayError(error, "AUTH_FAILED", "Authentication failed", 401);
  }
};

export const revokeOfficialSessionToken = async (
  sessionToken: string,
  options?: {
    runtimeTarget?: RuntimeTarget;
    runtimeBaseUrl?: string;
  }
): Promise<void> => {
  try {
    await runtimeOrchestrator.revokeOfficialSessionToken({
      target: options?.runtimeTarget ?? "gateway",
      baseUrl: options?.runtimeBaseUrl,
      sessionToken
    });
  } catch (error) {
    throw toGatewayError(error, "REVOKE_FAILED", "Revoke failed", 400);
  }
};

export const compileChat = async (
  request: CompileRequest
): Promise<CompileResponse> => {
  try {
    return await runtimeOrchestrator.compile({
      target: request.runtimeTarget ?? "gateway",
      baseUrl: request.runtimeBaseUrl,
      message: request.message,
      mode: request.mode,
      model: request.model,
      byokEndpoint: request.byokEndpoint,
      byokKey: request.byokKey,
      timeoutMs: request.timeoutMs,
      extraHeaders: request.extraHeaders,
      context: request.context,
      sessionToken: request.sessionToken
    });
  } catch (error) {
    throw toGatewayError(error, "COMPILE_FAILED", "Compile failed", 502);
  }
};
