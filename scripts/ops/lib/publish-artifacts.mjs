import fs from "node:fs/promises";
import path from "node:path";

import {
  buildArtifactObjectKey,
  createObjectStoreClient
} from "./object-store.mjs";

const ARTIFACT_FILES = ["manifest.json", "smoke.json", "benchmark.json", "summary.json"];

export const publishOpsArtifacts = async ({
  outputDir,
  env = process.env
}) => {
  const client = await createObjectStoreClient(env);
  const stamp = path.basename(outputDir);
  const publishedArtifacts = {};

  for (const fileName of ARTIFACT_FILES) {
    const filePath = path.join(outputDir, fileName);
    const body = await fs.readFile(filePath);
    const objectKey = buildArtifactObjectKey({
      prefix: env.OPS_ARTIFACT_PREFIX,
      stamp,
      fileName
    });
    const published = await client.putObject({
      objectKey,
      body,
      contentType: "application/json"
    });

    publishedArtifacts[fileName.replace(/\.json$/, "")] =
      published.url ?? published.objectKey;
  }

  return publishedArtifacts;
};
