export class CompileGuardBusyError extends Error {
  readonly code = "GATEWAY_BUSY";

  constructor(readonly maxInFlight: number) {
    super("Gateway compile capacity is full");
    this.name = "CompileGuardBusyError";
  }
}

export class CompileGuardTimeoutError extends Error {
  readonly code = "COMPILE_TIMEOUT";

  constructor(readonly timeoutMs: number) {
    super("Compile request exceeded gateway timeout");
    this.name = "CompileGuardTimeoutError";
  }
}

export interface CompileGuard {
  readonly maxInFlight: number;
  readonly timeoutMs: number;
  getInFlight: () => number;
  run: <T>(task: () => Promise<T>) => Promise<T>;
}

interface CreateCompileGuardOptions {
  maxInFlight: number;
  timeoutMs: number;
}

export const createCompileGuard = ({
  maxInFlight,
  timeoutMs
}: CreateCompileGuardOptions): CompileGuard => {
  let inFlight = 0;

  return {
    maxInFlight,
    timeoutMs,
    getInFlight: () => inFlight,
    run: async (task) => {
      if (inFlight >= maxInFlight) {
        throw new CompileGuardBusyError(maxInFlight);
      }

      inFlight += 1;
      let timeoutHandle: NodeJS.Timeout | undefined;
      try {
        const taskPromise = Promise.resolve().then(task);
        taskPromise.catch(() => undefined);

        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(new CompileGuardTimeoutError(timeoutMs));
          }, timeoutMs);
        });

        return await Promise.race([taskPromise, timeoutPromise]);
      } finally {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        inFlight = Math.max(0, inFlight - 1);
      }
    }
  };
};
