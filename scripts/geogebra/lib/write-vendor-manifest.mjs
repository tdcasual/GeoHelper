import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const writeVendorManifest = async (filePath, manifest) => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
};
