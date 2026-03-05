import { CommandBatch, CommandBatchSchema } from "@geohelper/protocol";

import { RuntimeApiError } from "./orchestrator";

export const parseJsonFromLlmContent = (value: unknown): unknown => {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    throw new RuntimeApiError(
      "LITELLM_INVALID_JSON",
      "Upstream response is not valid JSON",
      502
    );
  }
};

export const verifyCommandBatch = (value: unknown): CommandBatch => {
  const parsed = CommandBatchSchema.safeParse(value);
  if (!parsed.success) {
    throw new RuntimeApiError(
      "INVALID_COMMAND_BATCH",
      "Command batch validation failed",
      422
    );
  }

  return parsed.data;
};
