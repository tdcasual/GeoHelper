import type { PlatformRunProfile } from "@geohelper/agent-protocol";

import { platformRunProfiles } from "../runtime/platform-run-profiles";
import {
  getRuntimeControlPlaneBaseUrl,
  isGatewayRuntimeProfile,
  type RuntimeProfile
} from "./runtime-profiles";

export type PlatformRunProfileCatalogSource = "local" | "control_plane";
export type PlatformRunProfileCatalogStatus = "idle" | "loading" | "ready" | "error";

export interface PlatformRunProfileCatalogState {
  profiles: PlatformRunProfile[];
  source: PlatformRunProfileCatalogSource;
  status: PlatformRunProfileCatalogStatus;
  error: string | null;
  lastFetchedAt: string | null;
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

export const resolvePlatformRunProfileCatalogControlPlane = (input: {
  runtimeProfiles: RuntimeProfile[];
  defaultRuntimeProfileId: string;
}): { baseUrl: string } | null => {
  const runtimeProfile = input.runtimeProfiles.find(
    (item) => item.id === input.defaultRuntimeProfileId
  );

  if (!isGatewayRuntimeProfile(runtimeProfile)) {
    return null;
  }

  const baseUrl = getRuntimeControlPlaneBaseUrl(runtimeProfile);
  if (!baseUrl) {
    return null;
  }

  return {
    baseUrl
  };
};
