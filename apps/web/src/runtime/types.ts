import { CommandBatch } from "@geohelper/protocol";

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
  supportsAgentSteps: boolean;
  supportsServerMetrics: boolean;
  supportsRateLimitHeaders: boolean;
}

export const runtimeCapabilitiesByTarget: Record<
  RuntimeTarget,
  RuntimeCapabilities
> = {
  gateway: {
    supportsOfficialAuth: true,
    supportsAgentSteps: true,
    supportsServerMetrics: true,
    supportsRateLimitHeaders: true
  },
  direct: {
    supportsOfficialAuth: false,
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
