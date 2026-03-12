import type { RuntimeBackupMetadata } from "../runtime/types";
import type { RuntimeProfile } from "../state/settings-store";

export interface RemoteBackupActionStatus {
  enabled: boolean;
  reason: string | null;
}

export interface RemoteBackupActionState {
  gatewayProfile: RuntimeProfile | null;
  upload: RemoteBackupActionStatus;
  pull: RemoteBackupActionStatus;
  restore: RemoteBackupActionStatus;
}

interface ResolveRemoteBackupActionsParams {
  runtimeProfiles: RuntimeProfile[];
  defaultRuntimeProfileId: string;
  hasAdminToken: boolean;
  hasPulledBackup: boolean;
}

const GATEWAY_RUNTIME_REQUIRED = "请先配置可用的 Gateway 运行时地址";
const ADMIN_TOKEN_REQUIRED = "请先保存网关管理员令牌";
const PULL_BACKUP_REQUIRED = "请先从网关拉取最新备份";

const hasUsableGatewayBaseUrl = (profile: RuntimeProfile): boolean =>
  profile.target === "gateway" && profile.baseUrl.trim().length > 0;

const pickGatewayProfile = (
  runtimeProfiles: RuntimeProfile[],
  defaultRuntimeProfileId: string
): RuntimeProfile | null => {
  const preferred = runtimeProfiles.find(
    (profile) =>
      profile.id === defaultRuntimeProfileId && hasUsableGatewayBaseUrl(profile)
  );
  if (preferred) {
    return preferred;
  }

  return (
    runtimeProfiles.find((profile) => hasUsableGatewayBaseUrl(profile)) ?? null
  );
};

export const resolveRemoteBackupActions = (
  params: ResolveRemoteBackupActionsParams
): RemoteBackupActionState => {
  const gatewayProfile = pickGatewayProfile(
    params.runtimeProfiles,
    params.defaultRuntimeProfileId
  );

  if (!gatewayProfile) {
    return {
      gatewayProfile: null,
      upload: {
        enabled: false,
        reason: GATEWAY_RUNTIME_REQUIRED
      },
      pull: {
        enabled: false,
        reason: GATEWAY_RUNTIME_REQUIRED
      },
      restore: {
        enabled: params.hasPulledBackup,
        reason: params.hasPulledBackup ? null : PULL_BACKUP_REQUIRED
      }
    };
  }

  const uploadAndPullState = params.hasAdminToken
    ? {
        enabled: true,
        reason: null
      }
    : {
        enabled: false,
        reason: ADMIN_TOKEN_REQUIRED
      };

  return {
    gatewayProfile,
    upload: uploadAndPullState,
    pull: uploadAndPullState,
    restore: {
      enabled: params.hasPulledBackup,
      reason: params.hasPulledBackup ? null : PULL_BACKUP_REQUIRED
    }
  };
};

export const formatRemoteBackupActionMessage = (
  action: "push" | "pull",
  backup: Pick<RuntimeBackupMetadata, "conversation_count">
): string =>
  action === "push"
    ? `已上传到网关最新备份（${backup.conversation_count} 个会话）`
    : `已从网关拉取最新备份（${backup.conversation_count} 个会话）`;

export const formatRemoteBackupRestoreWarning = (
  _backup: Pick<RuntimeBackupMetadata, "stored_at" | "conversation_count">
): string =>
  "导入前请确认恢复策略：合并会保留较新的同 id 本地记录，覆盖会直接替换本地数据。";
