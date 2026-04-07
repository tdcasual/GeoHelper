import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  type LoadedPortableAgentBundle,
  loadPortableAgentBundle} from "./bundle-loader";

export const loadPortableAgentBundleFromFs = (
  bundleDir: string
): LoadedPortableAgentBundle =>
  loadPortableAgentBundle(bundleDir, {
    exists: existsSync,
    readText: (absolutePath) => readFileSync(absolutePath, "utf8"),
    resolve: (...segments) => path.resolve(...segments)
  });
