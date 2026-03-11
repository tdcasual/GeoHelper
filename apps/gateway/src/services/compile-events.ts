export type CompileEventType =
  | "compile_success"
  | "compile_validation_failure"
  | "compile_upstream_failure"
  | "compile_fallback"
  | "compile_repair";

export type CompileFinalStatus =
  | "success"
  | "fallback"
  | "repair"
  | "validation_failure"
  | "upstream_failure";

export interface CompileEventRecord {
  event: CompileEventType;
  finalStatus: CompileFinalStatus;
  traceId: string;
  requestId: string;
  path: string;
  method: string;
  mode?: string;
  statusCode: number;
  upstreamCallCount: number;
  detail?: string;
  metadata?: Record<string, unknown>;
}

export interface CompileEventSink {
  write: (event: CompileEventRecord) => void | Promise<void>;
  readRecent?: (
    limit: number
  ) => CompileEventRecord[] | Promise<CompileEventRecord[]>;
}

export interface MemoryCompileEventSink extends CompileEventSink {
  clear: () => void;
  readAll: () => CompileEventRecord[];
  readRecent: (limit: number) => CompileEventRecord[];
}

interface CompileEventLogger {
  info: (payload: unknown, message?: string) => void;
}

const normalizeLimit = (limit: number): number => Math.max(1, Math.floor(limit));

export const buildTraceId = (requestId: string): string => `tr_${requestId}`;

export const createLogCompileEventSink = (
  logger: CompileEventLogger
): CompileEventSink => ({
  write: (event) => {
    logger.info({ compile_event: event }, "compile_event");
  }
});

export const createMemoryCompileEventSink = (
  maxEvents = 200
): MemoryCompileEventSink => {
  const events: CompileEventRecord[] = [];

  return {
    write: (event) => {
      events.push(event);
      if (events.length > Math.max(1, Math.floor(maxEvents))) {
        events.shift();
      }
    },
    clear: () => {
      events.length = 0;
    },
    readAll: () => [...events],
    readRecent: (limit) => [...events].slice(-normalizeLimit(limit)).reverse()
  };
};

export const createFanoutCompileEventSink = (
  ...sinks: CompileEventSink[]
): CompileEventSink => ({
  write: async (event) => {
    for (const sink of sinks) {
      await sink.write(event);
    }
  },
  readRecent: async (limit) => {
    for (const sink of [...sinks].reverse()) {
      if (sink.readRecent) {
        return sink.readRecent(limit);
      }
    }

    return [];
  }
});

export const readRecentCompileEvents = async (
  sink: CompileEventSink,
  limit: number
): Promise<CompileEventRecord[]> => {
  if (!sink.readRecent) {
    return [];
  }

  return sink.readRecent(normalizeLimit(limit));
};
