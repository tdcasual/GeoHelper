import { createDirectClient } from "./direct-client";
import { createGatewayClient } from "./gateway-client";
import {
  createRuntimeOrchestrator,
  RuntimeApiError
} from "./orchestrator";
import {
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
  RuntimeBackupUploadRequest,
  RuntimeBackupUploadResponse,
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

export const resolveRuntimeCapabilities = async (params: {
  target: RuntimeTarget;
  baseUrl?: string;
  model?: string;
}): Promise<RuntimeCapabilities> => runtimeOrchestrator.resolveCapabilities(params);

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

export const uploadGatewayBackupGuarded = async (
  request: RuntimeBackupGuardedUploadRequest
): Promise<RuntimeBackupGuardedUploadResponse> =>
  gatewayRuntimeClient.uploadBackupGuarded(request);

export const downloadGatewayBackup = async (
  request: RuntimeBackupDownloadRequest
): Promise<RuntimeBackupDownloadResponse> => gatewayRuntimeClient.downloadBackup(request);

export const fetchGatewayBackupHistory = async (
  request: RuntimeBackupHistoryRequest
): Promise<RuntimeBackupHistoryResponse> =>
  gatewayRuntimeClient.fetchBackupHistory(request);

export const fetchGatewayLatestBackupMetadata = async (
  request: RuntimeBackupLatestMetadataRequest
): Promise<RuntimeBackupLatestMetadataResponse> =>
  gatewayRuntimeClient.fetchLatestBackupMetadata(request);

export const compareGatewayBackup = async (
  request: RuntimeBackupCompareRequest
): Promise<RuntimeBackupCompareResponse> =>
  gatewayRuntimeClient.compareBackup(request);
