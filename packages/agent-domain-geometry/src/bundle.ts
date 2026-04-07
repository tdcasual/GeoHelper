import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  type LoadedPortableAgentBundle,
  loadPortableAgentBundleFromFs} from "@geohelper/agent-bundle";

let cachedBundle: LoadedPortableAgentBundle | null = null;

export const getGeometryBundleDir = (): string =>
  path.resolve(fileURLToPath(new URL("../../../agents/geometry-solver", import.meta.url)));

export const loadGeometryBundle = (): LoadedPortableAgentBundle => {
  if (!cachedBundle) {
    cachedBundle = loadPortableAgentBundleFromFs(getGeometryBundleDir());
  }

  return cachedBundle;
};
