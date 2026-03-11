import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_OUTPUT_ROOT = path.resolve(process.cwd(), "output/ops");

export const resolveOpsArtifactDir = async (env = process.env) => {
  const outputRoot = path.resolve(env.OPS_OUTPUT_ROOT ?? DEFAULT_OUTPUT_ROOT);
  const stamp = String(env.OPS_ARTIFACT_STAMP ?? new Date().toISOString()).replace(/:/g, "-");
  const outputDir = path.join(outputRoot, stamp);
  await mkdir(outputDir, { recursive: true });
  return outputDir;
};

export const writeJsonArtifact = async (outputDir, name, payload) => {
  const fileName = `${name}.json`;
  await writeFile(
    path.join(outputDir, fileName),
    JSON.stringify(payload, null, 2) + "\n",
    "utf8"
  );
  return fileName;
};
