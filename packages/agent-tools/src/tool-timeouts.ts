import { createToolRunnerError } from "./tool-errors";

export const runWithOptionalTimeout = async <T>(
  operation: Promise<T>,
  timeoutMs?: number
): Promise<T> => {
  if (!timeoutMs || timeoutMs <= 0) {
    return operation;
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(createToolRunnerError("tool_timeout"));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};
