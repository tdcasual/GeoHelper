import { readFile } from "node:fs/promises";

const DEFAULT_CONFIG_URL = new URL("../../../config/geogebra.vendor.json", import.meta.url);
const VERSION_PATTERN = /^\d+\.\d+\.\d+\.\d+$/;

const assertString = (value, key) => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid GeoGebra vendor config: ${key} must be a non-empty string`);
  }
};

const assertBoolean = (value, key) => {
  if (typeof value !== "boolean") {
    throw new Error(`Invalid GeoGebra vendor config: ${key} must be a boolean`);
  }
};

const assertNumber = (value, key) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid GeoGebra vendor config: ${key} must be a positive number`);
  }
};

const assertStringArray = (value, key) => {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new Error(`Invalid GeoGebra vendor config: ${key} must be a non-empty string array`);
  }
};

export const readVendorConfig = async (configUrl = DEFAULT_CONFIG_URL) => {
  const raw = await readFile(configUrl, "utf8");
  const parsed = JSON.parse(raw);

  assertString(parsed.latestBundleUrl, "latestBundleUrl");
  assertString(parsed.fallbackVersion, "fallbackVersion");
  assertString(parsed.fallbackBundleUrl, "fallbackBundleUrl");
  assertNumber(parsed.requestTimeoutMs, "requestTimeoutMs");
  assertBoolean(parsed.allowCachedLastKnownGood, "allowCachedLastKnownGood");
  assertStringArray(parsed.expectedEntries, "expectedEntries");

  if (!VERSION_PATTERN.test(parsed.fallbackVersion)) {
    throw new Error("Invalid GeoGebra vendor config: fallbackVersion must use dotted numeric format");
  }

  return parsed;
};
