import { useEffect, useMemo, useState } from "react";

import { loginWithRuntime, revokeRuntimeSession } from "../../runtime/runtime-service";
import { type ChatMode, runtimeCapabilitiesByTarget } from "../../runtime/types";
import { useChatStore } from "../../state/chat-store";
import { useSettingsStore } from "../../state/settings-store";

interface UseWorkspaceRuntimeSessionInput {
  onOpenSettings: () => void;
}

const createDeviceId = () => {
  if (typeof localStorage === "undefined") {
    return `server_${Date.now()}`;
  }

  const key = "geohelper.device.id";
  const existing = localStorage.getItem(key);
  if (existing) {
    return existing;
  }

  const next = `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  localStorage.setItem(key, next);
  return next;
};

export const useWorkspaceRuntimeSession = ({
  onOpenSettings
}: UseWorkspaceRuntimeSessionInput) => {
  const mode = useChatStore((state) => state.mode);
  const reauthRequired = useChatStore((state) => state.reauthRequired);
  const sessionToken = useChatStore((state) => state.sessionToken);
  const setMode = useChatStore((state) => state.setMode);
  const setSessionToken = useChatStore((state) => state.setSessionToken);
  const acknowledgeReauth = useChatStore((state) => state.acknowledgeReauth);
  const runtimeProfiles = useSettingsStore((state) => state.runtimeProfiles);
  const defaultRuntimeProfileId = useSettingsStore(
    (state) => state.defaultRuntimeProfileId
  );

  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [deviceId] = useState(createDeviceId);

  const activeRuntimeProfile = useMemo(
    () =>
      runtimeProfiles.find((item) => item.id === defaultRuntimeProfileId) ??
      runtimeProfiles[0],
    [defaultRuntimeProfileId, runtimeProfiles]
  );
  const runtimeTarget = activeRuntimeProfile?.target ?? "direct";
  const runtimeBaseUrl = activeRuntimeProfile?.baseUrl || undefined;
  const runtimeSupportsOfficial =
    runtimeCapabilitiesByTarget[runtimeTarget].supportsOfficialAuth;
  const activeRuntimeLabel = `运行时：${
    activeRuntimeProfile?.name ?? runtimeTarget
  }`;

  const handleModeChange = (nextMode: ChatMode) => {
    if (nextMode === "official" && !runtimeSupportsOfficial) {
      onOpenSettings();
      return;
    }

    setMode(nextMode);
    if (nextMode === "official" && !sessionToken) {
      setTokenDialogOpen(true);
    }
  };

  useEffect(() => {
    if (mode === "official" && reauthRequired && runtimeSupportsOfficial) {
      setTokenDialogOpen(true);
      acknowledgeReauth();
    }
  }, [acknowledgeReauth, mode, reauthRequired, runtimeSupportsOfficial]);

  useEffect(() => {
    if (mode === "official" && !runtimeSupportsOfficial) {
      setMode("byok");
      setSessionToken(null);
      setTokenDialogOpen(false);
    }
  }, [mode, runtimeSupportsOfficial, setMode, setSessionToken]);

  const handleLogout = async () => {
    if (!sessionToken) {
      return;
    }

    try {
      await revokeRuntimeSession({
        target: runtimeTarget,
        baseUrl: runtimeBaseUrl,
        sessionToken
      });
    } catch {
      // Even when revoke fails remotely, local session must be cleared.
    }

    setSessionToken(null);
  };

  const submitToken = async (token: string) => {
    const result = await loginWithRuntime({
      target: runtimeTarget,
      baseUrl: runtimeBaseUrl,
      token,
      deviceId
    });
    setSessionToken(result.session_token);
    setTokenDialogOpen(false);
  };

  return {
    activeRuntimeLabel,
    mode,
    runtimeBaseUrl,
    runtimeSupportsOfficial,
    runtimeTarget,
    sessionToken,
    tokenDialogOpen,
    closeTokenDialog: () => {
      setTokenDialogOpen(false);
    },
    handleLogout,
    handleModeChange,
    setMode,
    submitToken
  };
};
