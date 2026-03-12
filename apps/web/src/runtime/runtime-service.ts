import { createDirectClient } from "./direct-client";
import { createGatewayClient } from "./gateway-client";
import {
  createRuntimeOrchestrator,
  RuntimeApiError
} from "./orchestrator";
import {
  RuntimeBackupDownloadRequest,
  RuntimeBackupDownloadResponse,
  RuntimeBackupUploadRequest,
  RuntimeBackupUploadResponse,
  RuntimeCapabilities,
  RuntimeCompileRequest,
  RuntimeCompileResponse,
  RuntimeLoginRequest,
  RuntimeLoginResponse,
  RuntimeRevokeRequest,
  RuntimeTarget
} from "./types";

const gatewayRuntimeClient = createGatewayClient();
const runtimeOrchestrator = createRuntimeOrchestrator({
  gateway: gatewayRuntimeClient,
  direct: createDirectClient()
});

export type {
  RuntimeTarget,
  RuntimeCapabilities,
  RuntimeCompileRequest,
  RuntimeCompileResponse,
  RuntimeLoginRequest,
  RuntimeLoginResponse,
  RuntimeRevokeRequest
};

export { RuntimeApiError };

export const getRuntimeCapabilities = (
  runtimeTarget: RuntimeTarget
): RuntimeCapabilities => runtimeOrchestrator.getCapabilities(runtimeTarget);

export const compileWithRuntime = async (
  request: RuntimeCompileRequest
): Promise<RuntimeCompileResponse> => runtimeOrchestrator.compile(request);

export const loginWithRuntime = async (
  request: RuntimeLoginRequest
): Promise<RuntimeLoginResponse> =>
  runtimeOrchestrator.loginWithPresetToken(request);

export const revokeRuntimeSession = async (
  request: RuntimeRevokeRequest
): Promise<void> => runtimeOrchestrator.revokeOfficialSessionToken(request);

export const uploadGatewayBackup = async (
  request: RuntimeBackupUploadRequest
): Promise<RuntimeBackupUploadResponse> => gatewayRuntimeClient.uploadBackup(request);

export const downloadGatewayBackup = async (
  request: RuntimeBackupDownloadRequest
): Promise<RuntimeBackupDownloadResponse> => gatewayRuntimeClient.downloadBackup(request);
