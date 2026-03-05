import {
  RuntimeCapabilities,
  RuntimeCompileRequest,
  RuntimeCompileResponse,
  RuntimeLoginRequest,
  RuntimeLoginResponse,
  RuntimeRevokeRequest,
  RuntimeTarget
} from "./types";

export class RuntimeApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export interface RuntimeClient {
  target: RuntimeTarget;
  capabilities: RuntimeCapabilities;
  compile: (request: RuntimeCompileRequest) => Promise<RuntimeCompileResponse>;
  loginWithPresetToken?: (
    request: RuntimeLoginRequest
  ) => Promise<RuntimeLoginResponse>;
  revokeOfficialSessionToken?: (request: RuntimeRevokeRequest) => Promise<void>;
}

export interface RuntimeOrchestratorDeps {
  gateway?: RuntimeClient;
  direct?: RuntimeClient;
}

const resolveClient = (
  clients: RuntimeOrchestratorDeps,
  target: RuntimeTarget
): RuntimeClient => {
  const client = target === "gateway" ? clients.gateway : clients.direct;
  if (!client) {
    throw new RuntimeApiError(
      "RUNTIME_TARGET_UNAVAILABLE",
      `Runtime target "${target}" is unavailable`,
      503
    );
  }
  return client;
};

export const createRuntimeOrchestrator = (clients: RuntimeOrchestratorDeps) => ({
  getCapabilities: (target: RuntimeTarget): RuntimeCapabilities =>
    resolveClient(clients, target).capabilities,

  compile: async (
    request: RuntimeCompileRequest
  ): Promise<RuntimeCompileResponse> => {
    const client = resolveClient(clients, request.target);

    if (request.mode === "official" && !client.capabilities.supportsOfficialAuth) {
      throw new RuntimeApiError(
        "RUNTIME_MODE_UNSUPPORTED",
        "Official mode requires a runtime target that supports official auth",
        400
      );
    }

    return client.compile(request);
  },

  loginWithPresetToken: async (
    request: RuntimeLoginRequest
  ): Promise<RuntimeLoginResponse> => {
    const client = resolveClient(clients, request.target);
    if (!client.loginWithPresetToken) {
      throw new RuntimeApiError(
        "RUNTIME_AUTH_UNSUPPORTED",
        `Runtime target "${request.target}" does not support preset token login`,
        400
      );
    }

    return client.loginWithPresetToken(request);
  },

  revokeOfficialSessionToken: async (
    request: RuntimeRevokeRequest
  ): Promise<void> => {
    const client = resolveClient(clients, request.target);
    if (!client.revokeOfficialSessionToken) {
      throw new RuntimeApiError(
        "RUNTIME_AUTH_UNSUPPORTED",
        `Runtime target "${request.target}" does not support revoke`,
        400
      );
    }

    return client.revokeOfficialSessionToken(request);
  }
});
