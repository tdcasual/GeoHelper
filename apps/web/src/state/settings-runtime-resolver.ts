import type { PlatformRunProfile } from "@geohelper/agent-protocol";

import { createControlPlaneClient } from "../runtime/control-plane-client";
import { getPlatformRunProfile } from "../runtime/platform-run-profiles";
import { resolveRuntimeCapabilities } from "../runtime/runtime-service";
import {
  type ChatMode,
  resolveRuntimeCapabilitiesForModel,
  type RuntimeCapabilities
} from "../runtime/types";
import {
  browserSecretService,
  type SecretService
} from "../services/secure-secret";
import type {
  ByokPreset,
  ByokRuntimeIssue,
  CompileRuntimeOptions,
  SettingsStoreState
} from "./settings-store";

type DebugEventInput = {
  level: "info" | "error";
  message: string;
};

interface BuildCompileRuntimeOptionsInput {
  state: SettingsStoreState;
  conversationId: string;
  mode: ChatMode;
  secretService?: SecretService;
  listRunProfiles?: () => Promise<PlatformRunProfile[]>;
  resolveCapabilities?: (params: {
    target: "gateway" | "direct";
    baseUrl?: string;
    model?: string;
  }) => Promise<RuntimeCapabilities>;
}

export interface BuildCompileRuntimeOptionsResult
  extends CompileRuntimeOptions {
  resolvedByokPresetId?: string;
  didResolveByokKey: boolean;
}

const buildExtraHeaders = (): Record<string, string> =>
  // Legacy compile-route client flags are no longer emitted on the active path.
  ({});

const getDefaultPreset = (
  mode: ChatMode,
  state: Pick<
    SettingsStoreState,
    | "byokPresets"
    | "officialPresets"
    | "defaultByokPresetId"
    | "defaultOfficialPresetId"
  >
) => {
  if (mode === "byok") {
    return (
      state.byokPresets.find((item) => item.id === state.defaultByokPresetId) ??
      state.byokPresets[0]
    );
  }

  return (
    state.officialPresets.find(
      (item) => item.id === state.defaultOfficialPresetId
    ) ?? state.officialPresets[0]
  );
};

const getDefaultRuntimeProfile = (
  state: Pick<SettingsStoreState, "runtimeProfiles" | "defaultRuntimeProfileId">
) =>
  state.runtimeProfiles.find(
    (item) => item.id === state.defaultRuntimeProfileId
  ) ?? state.runtimeProfiles[0];

const resolvePlatformRunProfile = async ({
  runtimeTarget,
  runtimeBaseUrl,
  selectedProfileId,
  listRunProfiles
}: {
  runtimeTarget: "gateway" | "direct";
  runtimeBaseUrl?: string;
  selectedProfileId: string;
  listRunProfiles?: () => Promise<PlatformRunProfile[]>;
}): Promise<PlatformRunProfile> => {
  const localProfile = getPlatformRunProfile(selectedProfileId);
  const resolveRemoteProfiles =
    listRunProfiles ??
    (runtimeBaseUrl
      ? createControlPlaneClient({
          baseUrl: runtimeBaseUrl
        }).listRunProfiles
      : undefined);

  if (runtimeTarget !== "gateway" || !resolveRemoteProfiles) {
    return localProfile;
  }

  try {
    const remoteProfiles = await resolveRemoteProfiles();

    return (
      remoteProfiles.find((profile) => profile.id === selectedProfileId) ??
      remoteProfiles[0] ??
      localProfile
    );
  } catch {
    return localProfile;
  }
};

export const resolveRuntimeProfileSelection = (
  state: SettingsStoreState,
  mode: ChatMode = state.defaultMode
): {
  profile: SettingsStoreState["runtimeProfiles"][number];
  capabilities: RuntimeCapabilities;
} => {
  const profile = getDefaultRuntimeProfile(state);
  const preset = getDefaultPreset(mode, state);
  return {
    profile,
    capabilities: resolveRuntimeCapabilitiesForModel({
      runtimeTarget: profile.target,
      model: preset?.model
    })
  };
};

export const buildCompileRuntimeOptions = async (
  input: BuildCompileRuntimeOptionsInput
): Promise<BuildCompileRuntimeOptionsResult> => {
  const runtimeProfile = getDefaultRuntimeProfile(input.state);
  const runtimeBaseUrl = runtimeProfile.baseUrl || undefined;
  const preset = getDefaultPreset(input.mode, input.state);
  const session = input.state.sessionOverrides[input.conversationId] ?? {};
  const activeModel = session.model ?? preset.model;
  const resolveCapabilities =
    input.resolveCapabilities ?? resolveRuntimeCapabilities;
  const [runtimeCapabilities, platformRunProfile] = await Promise.all([
    resolveCapabilities({
      target: runtimeProfile.target,
      baseUrl: runtimeBaseUrl,
      model: activeModel
    }),
    resolvePlatformRunProfile({
      runtimeTarget: runtimeProfile.target,
      runtimeBaseUrl,
      selectedProfileId: input.state.defaultPlatformAgentProfileId,
      listRunProfiles: input.listRunProfiles
    })
  ]);

  let byokEndpoint: string | undefined;
  let byokKey: string | undefined;
  let byokRuntimeIssue: ByokRuntimeIssue | undefined;
  let resolvedByokPresetId: string | undefined;
  let didResolveByokKey = false;

  if (input.mode === "byok") {
    const byokPreset = preset as ByokPreset;
    resolvedByokPresetId = byokPreset.id;
    if (runtimeProfile.target === "direct") {
      byokEndpoint = byokPreset.endpoint || runtimeBaseUrl;
    } else {
      byokEndpoint = byokPreset.endpoint || undefined;
    }

    if (byokPreset.apiKeyCipher) {
      try {
        byokKey = await (input.secretService ?? browserSecretService).decrypt(
          byokPreset.apiKeyCipher
        );
        didResolveByokKey = true;
      } catch {
        byokRuntimeIssue = {
          code: "BYOK_KEY_DECRYPT_FAILED",
          presetId: byokPreset.id,
          presetName: byokPreset.name,
          message: "BYOK Key 解密失败，请重新填写 API Key"
        };
      }
    }
  }

  return {
    runtimeTarget: runtimeProfile.target,
    runtimeBaseUrl,
    runtimeCapabilities,
    platformRunProfile,
    model: activeModel,
    byokEndpoint,
    byokKey,
    byokRuntimeIssue,
    timeoutMs: input.state.experimentFlags.requestTimeoutEnabled
      ? session.timeoutMs ?? preset.timeoutMs
      : undefined,
    retryAttempts: input.state.experimentFlags.autoRetryEnabled
      ? session.retryAttempts ?? input.state.requestDefaults.retryAttempts
      : 0,
    extraHeaders: buildExtraHeaders(),
    resolvedByokPresetId,
    didResolveByokKey
  };
};

export const maybeAppendDebugEvent = <T extends DebugEventInput>(
  state: Pick<SettingsStoreState, "experimentFlags">,
  event: T
): T[] => (state.experimentFlags.debugLogPanelEnabled ? [event] : []);
