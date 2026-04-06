import type { PlatformRunProfile } from "@geohelper/agent-protocol";

import { platformRunProfiles } from "../runtime/platform-run-profiles";

export type PlatformRunProfileCatalogSource = "local" | "control_plane";
export type PlatformRunProfileCatalogStatus = "idle" | "loading" | "ready" | "error";

export interface PlatformRunProfileCatalogState {
  profiles: PlatformRunProfile[];
  source: PlatformRunProfileCatalogSource;
  status: PlatformRunProfileCatalogStatus;
  error: string | null;
  lastFetchedAt: string | null;
}

interface RuntimeProfileLike {
  id: string;
  target: "gateway" | "direct";
  baseUrl: string;
}

const cloneProfile = (profile: PlatformRunProfile): PlatformRunProfile => ({
  ...profile,
  defaultBudget: {
    ...profile.defaultBudget
  }
});

export const getLocalPlatformRunProfiles = (): PlatformRunProfile[] =>
  platformRunProfiles.map(cloneProfile);

export const createPlatformRunProfileCatalogState = (
  overrides: Partial<PlatformRunProfileCatalogState> = {}
): PlatformRunProfileCatalogState => ({
  profiles: getLocalPlatformRunProfiles(),
  source: "local",
  status: "idle",
  error: null,
  lastFetchedAt: null,
  ...overrides
});

export const resolvePlatformRunProfileCatalogGateway = (input: {
  runtimeProfiles: RuntimeProfileLike[];
  defaultRuntimeProfileId: string;
}): { baseUrl: string } | null => {
  const runtimeProfile = input.runtimeProfiles.find(
    (item) => item.id === input.defaultRuntimeProfileId
  );

  if (!runtimeProfile || runtimeProfile.target !== "gateway") {
    return null;
  }

  const baseUrl = runtimeProfile.baseUrl.trim();
  if (!baseUrl) {
    return null;
  }

  return {
    baseUrl
  };
};
