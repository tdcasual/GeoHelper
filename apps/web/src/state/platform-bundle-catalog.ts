import type { PortableBundleCatalogEntry } from "../runtime/types";

export type PlatformBundleCatalogSource = "local" | "control_plane";
export type PlatformBundleCatalogStatus = "idle" | "loading" | "ready" | "error";

export interface PlatformBundleCatalogState {
  bundles: PortableBundleCatalogEntry[];
  source: PlatformBundleCatalogSource;
  status: PlatformBundleCatalogStatus;
  error: string | null;
  lastFetchedAt: string | null;
}

export const createPlatformBundleCatalogState = (
  overrides: Partial<PlatformBundleCatalogState> = {}
): PlatformBundleCatalogState => ({
  bundles: [],
  source: "local",
  status: "idle",
  error: null,
  lastFetchedAt: null,
  ...overrides
});
