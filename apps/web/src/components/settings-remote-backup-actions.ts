import type { RuntimeBackupMetadata } from "../runtime/types";
import type { RuntimeProfile } from "../state/settings-store";

export interface RemoteBackupActionStatus {
  enabled: boolean;
  reason: string | null;
}

export interface RemoteBackupActionState {
  gatewayProfile: RuntimeProfile | null;
  check: RemoteBackupActionStatus;
  upload: RemoteBackupActionStatus;
  pull: RemoteBackupActionStatus;
  restore: RemoteBackupActionStatus;
}

export interface ResolveRemoteBackupActionsParams {
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
      check: {
        enabled: false,
        reason: GATEWAY_RUNTIME_REQUIRED
      },
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
    check: uploadAndPullState,
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

export const formatRemoteBackupProtectionActionMessage = (
  action: "protect" | "unprotect",
  backup: Pick<RuntimeBackupMetadata, "snapshot_id">
): string =>
  action === "protect"
    ? `已保护所选快照（${backup.snapshot_id}）`
    : `已取消保护所选快照（${backup.snapshot_id}）`;

export const formatRemoteBackupProtectionLimitMessage = (input: {
  protected_count: number;
  max_protected: number;
}): string =>
  `受保护快照已达上限（${input.protected_count}/${input.max_protected}），请先取消保护旧快照。`;
