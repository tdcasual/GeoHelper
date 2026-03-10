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
}

export interface MemoryCompileEventSink extends CompileEventSink {
  clear: () => void;
  readAll: () => CompileEventRecord[];
}

interface CompileEventLogger {
  info: (payload: unknown, message?: string) => void;
}

export const buildTraceId = (requestId: string): string => `tr_${requestId}`;

export const createLogCompileEventSink = (
  logger: CompileEventLogger
): CompileEventSink => ({
  write: (event) => {
    logger.info({ compile_event: event }, "compile_event");
  }
});

export const createMemoryCompileEventSink = (): MemoryCompileEventSink => {
  const events: CompileEventRecord[] = [];

  return {
    write: (event) => {
      events.push(event);
    },
    clear: () => {
      events.length = 0;
    },
    readAll: () => [...events]
  };
};
