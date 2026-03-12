import {
  resolveRuntimeCapabilitiesForModel,
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
  resolveCapabilities?: (params: {
    baseUrl?: string;
    model?: string;
  }) => Promise<RuntimeCapabilities>;
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

const resolveClientCapabilities = async (
  client: RuntimeClient,
  params: {
    baseUrl?: string;
    model?: string;
  }
): Promise<RuntimeCapabilities> => {
  if (client.resolveCapabilities) {
    return client.resolveCapabilities(params);
  }

  return resolveRuntimeCapabilitiesForModel({
    runtimeTarget: client.target,
    model: params.model
  });
};

export const createRuntimeOrchestrator = (clients: RuntimeOrchestratorDeps) => ({
  getCapabilities: (target: RuntimeTarget): RuntimeCapabilities =>
    resolveClient(clients, target).capabilities,

  resolveCapabilities: async (params: {
    target: RuntimeTarget;
    baseUrl?: string;
    model?: string;
  }): Promise<RuntimeCapabilities> =>
    resolveClientCapabilities(resolveClient(clients, params.target), params),

  compile: async (
    request: RuntimeCompileRequest
  ): Promise<RuntimeCompileResponse> => {
    const client = resolveClient(clients, request.target);
    const capabilities = await resolveClientCapabilities(client, {
      baseUrl: request.baseUrl,
      model: request.model
    });

    if (request.mode === "official" && !capabilities.supportsOfficialAuth) {
      throw new RuntimeApiError(
        "RUNTIME_MODE_UNSUPPORTED",
        "Official mode requires a runtime target that supports official auth",
        400
      );
    }

    if ((request.attachments?.length ?? 0) > 0 && !capabilities.supportsVision) {
      throw new RuntimeApiError(
        "RUNTIME_ATTACHMENTS_UNSUPPORTED",
        "Current runtime target does not support image attachments",
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
