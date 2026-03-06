import { execFile } from "node:child_process";
import { access, cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { readVendorConfig } from "./read-vendor-config.mjs";
import { parseBundleSource, resolveBundleSource } from "./resolve-bundle-source.mjs";
import { buildVendorManifest, detectBundleLayout } from "./validate-bundle.mjs";
import { writeVendorManifest } from "./write-vendor-manifest.mjs";

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(new URL("../../../", import.meta.url).pathname);
const CACHE_ROOT = path.join(REPO_ROOT, ".cache", "geogebra");
const ARCHIVE_ROOT = path.join(CACHE_ROOT, "archives");
const EXTRACT_ROOT = path.join(CACHE_ROOT, "extracted");
const LAST_KNOWN_GOOD_FILE = path.join(CACHE_ROOT, "last-known-good.json");
const PUBLISH_ROOT = path.join(
  REPO_ROOT,
  "apps",
  "web",
  "public",
  "vendor",
  "geogebra",
  "current"
);
const MANIFEST_FILE = path.join(
  REPO_ROOT,
  "apps",
  "web",
  "public",
  "vendor",
  "geogebra",
  "manifest.json"
);
const PUBLISH_BASE_URL = "/vendor/geogebra/current";

const fileExists = async (filePath) => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const ensureDir = async (directoryPath) => {
  await mkdir(directoryPath, { recursive: true });
};

const readLastKnownGood = async () => {
  if (!(await fileExists(LAST_KNOWN_GOOD_FILE))) {
    throw new Error("No cached last-known-good GeoGebra version is available");
  }

  const raw = await readFile(LAST_KNOWN_GOOD_FILE, "utf8");
  return JSON.parse(raw);
};

const writeLastKnownGood = async (record) => {
  await ensureDir(path.dirname(LAST_KNOWN_GOOD_FILE));
  await writeFile(LAST_KNOWN_GOOD_FILE, `${JSON.stringify(record, null, 2)}\n`, "utf8");
};

const downloadArchive = async ({ fetchImpl, source, requestTimeoutMs }) => {
  await ensureDir(ARCHIVE_ROOT);

  const archivePath = path.join(ARCHIVE_ROOT, source.filename);
  if (await fileExists(archivePath)) {
    return archivePath;
  }

  const response = await fetchImpl(source.url, {
    method: "GET",
    redirect: "follow",
    signal: AbortSignal.timeout(requestTimeoutMs)
  });

  if (!response.ok) {
    throw new Error(`Failed to download GeoGebra archive: ${response.status}`);
  }

  const body = Buffer.from(await response.arrayBuffer());
  await writeFile(archivePath, body);
  return archivePath;
};

const extractArchive = async ({ archivePath, version }) => {
  const extractPath = path.join(EXTRACT_ROOT, version);
  await rm(extractPath, { recursive: true, force: true });
  await ensureDir(extractPath);
  await execFileAsync("unzip", ["-oq", archivePath, "-d", extractPath]);
  return extractPath;
};

const resolveExtractedBundleRoot = async (extractPath) => {
  if (await fileExists(path.join(extractPath, "deployggb.js"))) {
    return extractPath;
  }

  const entries = await stat(extractPath).then(async () =>
    (await import("node:fs/promises")).readdir(extractPath, { withFileTypes: true })
  );
  const directories = entries.filter((entry) => entry.isDirectory());

  if (directories.length === 1) {
    const nestedRoot = path.join(extractPath, directories[0].name);
    if (await fileExists(path.join(nestedRoot, "deployggb.js"))) {
      return nestedRoot;
    }
  }

  return extractPath;
};

const publishBundle = async ({ bundleRoot, manifest }) => {
  await rm(PUBLISH_ROOT, { recursive: true, force: true });
  await ensureDir(path.dirname(PUBLISH_ROOT));
  await cp(bundleRoot, PUBLISH_ROOT, { recursive: true, force: true });
  await writeVendorManifest(MANIFEST_FILE, manifest);
};

const syncSource = async ({ fetchImpl, source, resolvedFrom, config }) => {
  const archivePath = await downloadArchive({
    fetchImpl,
    source,
    requestTimeoutMs: config.requestTimeoutMs
  });
  const extractPath = await extractArchive({ archivePath, version: source.version });
  const bundleRoot = await resolveExtractedBundleRoot(extractPath);
  const layout = await detectBundleLayout(bundleRoot);

  const manifest = buildVendorManifest({
    version: source.version,
    resolvedFrom,
    sourceUrl: source.url,
    publishRoot: PUBLISH_BASE_URL,
    layout
  });

  await publishBundle({ bundleRoot, manifest });
  await writeLastKnownGood(source);

  return manifest;
};

export const syncWithFallbacks = async ({
  tryLatest,
  tryFallback,
  tryLastKnownGood
}) => {
  try {
    return await tryLatest();
  } catch (latestError) {
    try {
      return await tryFallback();
    } catch (fallbackError) {
      try {
        return await tryLastKnownGood();
      } catch (lastKnownGoodError) {
        throw new AggregateError(
          [latestError, fallbackError, lastKnownGoodError],
          "Failed to synchronize GeoGebra bundle from latest, fallback, and last-known-good sources"
        );
      }
    }
  }
};

export const runSyncBundle = async ({ fetchImpl = fetch } = {}) => {
  const config = await readVendorConfig();

  return syncWithFallbacks({
    tryLatest: async () => {
      const latestSource = await resolveBundleSource(fetchImpl, config.latestBundleUrl);
      return syncSource({ fetchImpl, source: latestSource, resolvedFrom: "latest", config });
    },
    tryFallback: async () => {
      const fallbackSource = parseBundleSource(config.fallbackBundleUrl);
      return syncSource({ fetchImpl, source: fallbackSource, resolvedFrom: "fallback", config });
    },
    tryLastKnownGood: async () => {
      if (!config.allowCachedLastKnownGood) {
        throw new Error("Cached last-known-good usage is disabled");
      }

      const lastKnownGoodSource = await readLastKnownGood();
      return syncSource({
        fetchImpl,
        source: lastKnownGoodSource,
        resolvedFrom: "last-known-good",
        config
      });
    }
  });
};
