import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const EXTERNAL_PATTERN = /geogebra\.org/i;
const DIST_ROOT = path.resolve(new URL("../../apps/web/dist", import.meta.url).pathname);
const IGNORED_PATH_SEGMENTS = [
  "vendor/geogebra/current/",
  "vendor/geogebra/manifest.json"
];

const shouldIgnorePath = (filePath) =>
  IGNORED_PATH_SEGMENTS.some((segment) => filePath.includes(segment));

export const findExternalGeoGebraRefs = (files) =>
  files
    .filter((file) => !shouldIgnorePath(file.path))
    .filter((file) => EXTERNAL_PATTERN.test(file.content))
    .map((file) => ({ path: file.path }));

const collectFiles = async (rootDir) => {
  const files = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = await readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(next);
        continue;
      }

      files.push(next);
    }
  }

  return files;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const filePaths = await collectFiles(DIST_ROOT);
  const files = await Promise.all(
    filePaths.map(async (filePath) => ({
      path: path.relative(process.cwd(), filePath),
      content: await readFile(filePath, "utf8").catch(() => "")
    }))
  );
  const refs = findExternalGeoGebraRefs(files);

  if (refs.length > 0) {
    console.error("External GeoGebra references found:");
    for (const ref of refs) {
      console.error(`- ${ref.path}`);
    }
    process.exitCode = 1;
  } else {
    console.log("No external GeoGebra references found in apps/web/dist");
  }
}
