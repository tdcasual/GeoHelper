import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  type LoadedPortableAgentBundle,
  loadPortableAgentBundleFromFs} from "@geohelper/agent-bundle";

const bundleCache = new Map<string, LoadedPortableAgentBundle>();

export const getGeometryBundleDir = (): string =>
  path.resolve(fileURLToPath(new URL("../../../agents/geometry-solver", import.meta.url)));

export const getGeometryReviewerBundleDir = (): string =>
  path.resolve(fileURLToPath(new URL("../../../agents/geometry-reviewer", import.meta.url)));

const loadCachedBundle = (bundleDir: string): LoadedPortableAgentBundle => {
  const cachedBundle = bundleCache.get(bundleDir);

  if (cachedBundle) {
    return cachedBundle;
  }

  const bundle = loadPortableAgentBundleFromFs(bundleDir);
  bundleCache.set(bundleDir, bundle);

  return bundle;
};

export const loadGeometryBundle = (): LoadedPortableAgentBundle =>
  loadCachedBundle(getGeometryBundleDir());

export const loadGeometryReviewerBundle = (): LoadedPortableAgentBundle =>
  loadCachedBundle(getGeometryReviewerBundleDir());
