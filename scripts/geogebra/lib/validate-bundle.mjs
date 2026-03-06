import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const toPosixRelativePath = (rootDir, filePath) =>
  path.relative(rootDir, filePath).split(path.sep).join("/");

const ensureTrailingSlash = (value) => (value.endsWith("/") ? value : `${value}/`);

const collectDirectories = async (rootDir) => {
  const directories = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = await readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const next = path.join(current, entry.name);
      directories.push(next);
      stack.push(next);
    }
  }

  return directories;
};

export const detectBundleLayout = async (rootDir) => {
  const deployScriptPath = path.join(rootDir, "deployggb.js");
  const deployStat = await stat(deployScriptPath).catch(() => null);

  if (!deployStat?.isFile()) {
    throw new Error("GeoGebra bundle is missing deployggb.js");
  }

  const directories = await collectDirectories(rootDir);
  const html5CodebaseDir = directories.find((directory) => /HTML5[\\/][^\\/]+[\\/]web3d$/.test(directory));

  if (!html5CodebaseDir) {
    throw new Error("GeoGebra bundle is missing an HTML5 web3d codebase");
  }

  const languageKeyFile = path.join(html5CodebaseDir, "js", "properties_keys_zh-CN.js");
  const languageKeyStat = await stat(languageKeyFile).catch(() => null);

  if (!languageKeyStat?.isFile()) {
    throw new Error("GeoGebra bundle is missing expected HTML5 language assets");
  }

  return {
    deployScriptPath,
    deployScriptRelativePath: toPosixRelativePath(rootDir, deployScriptPath),
    html5CodebasePath: ensureTrailingSlash(html5CodeDirRelativeToRoot(rootDir, html5CodebaseDir)),
    html5CodebaseRelativePath: ensureTrailingSlash(
      toPosixRelativePath(rootDir, html5CodebaseDir)
    )
  };
};

const html5CodeDirRelativeToRoot = (rootDir, codebaseDir) =>
  path.join(rootDir, toPosixRelativePath(rootDir, codebaseDir));

export const buildVendorManifest = ({
  version,
  resolvedFrom,
  sourceUrl,
  publishRoot,
  layout
}) => ({
  resolvedVersion: version,
  resolvedFrom,
  sourceUrl,
  deployScriptPath: `${publishRoot}/${layout.deployScriptRelativePath}`,
  html5CodebasePath: ensureTrailingSlash(
    `${publishRoot}/${layout.html5CodebaseRelativePath}`.replace(/\/+/g, "/")
  ),
  builtAt: new Date().toISOString(),
  integritySummary: {
    deployScriptRelativePath: layout.deployScriptRelativePath,
    html5CodebaseRelativePath: layout.html5CodebaseRelativePath
  }
});
