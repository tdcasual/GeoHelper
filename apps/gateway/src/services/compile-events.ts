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
  recordedAt?: string;
}

export interface CompileEventQuery {
  limit: number;
  traceId?: string;
  mode?: string;
  finalStatus?: CompileFinalStatus;
  requestId?: string;
  since?: string;
}

export type CompileEventQueryInput = number | Partial<CompileEventQuery>;

export interface CompileEventSink {
  write: (event: CompileEventRecord) => void | Promise<void>;
  readRecent?: (
    query?: CompileEventQueryInput
  ) => CompileEventRecord[] | Promise<CompileEventRecord[]>;
}

export interface MemoryCompileEventSink extends CompileEventSink {
  clear: () => void;
  readAll: () => CompileEventRecord[];
  readRecent: (query?: CompileEventQueryInput) => CompileEventRecord[];
}

interface CompileEventLogger {
  info: (payload: unknown, message?: string) => void;
}

const DEFAULT_COMPILE_EVENT_LIMIT = 20;

export const normalizeCompileEventQuery = (
  input?: CompileEventQueryInput
): CompileEventQuery => {
  if (typeof input === "number") {
    return {
      limit: Math.max(1, Math.floor(input))
    };
  }

  return {
    limit: Math.max(1, Math.floor(input?.limit ?? DEFAULT_COMPILE_EVENT_LIMIT)),
    traceId: input?.traceId?.trim() || undefined,
    mode: input?.mode?.trim() || undefined,
    finalStatus: input?.finalStatus,
    requestId: input?.requestId?.trim() || undefined,
    since: input?.since?.trim() || undefined
  };
};

export const normalizeCompileEventRecord = (
  event: CompileEventRecord
): CompileEventRecord => ({
  ...event,
  recordedAt: event.recordedAt ?? new Date().toISOString()
});

const matchesSince = (event: CompileEventRecord, since?: string): boolean => {
  if (!since) {
    return true;
  }

  const sinceTime = Date.parse(since);
  if (Number.isNaN(sinceTime)) {
    return true;
  }

  const eventTime = Date.parse(event.recordedAt ?? "");
  if (Number.isNaN(eventTime)) {
    return false;
  }

  return eventTime >= sinceTime;
};

export const filterCompileEvents = (
  events: CompileEventRecord[],
  input?: CompileEventQueryInput
): CompileEventRecord[] => {
  const query = normalizeCompileEventQuery(input);

  return [...events]
    .filter((event) => {
      if (query.traceId && event.traceId !== query.traceId) {
        return false;
      }
      if (query.mode && event.mode !== query.mode) {
        return false;
      }
      if (query.finalStatus && event.finalStatus !== query.finalStatus) {
        return false;
      }
      if (query.requestId && event.requestId !== query.requestId) {
        return false;
      }
      return matchesSince(event, query.since);
    })
    .slice(-query.limit)
    .reverse();
};

export const buildTraceId = (requestId: string): string => `tr_${requestId}`;

export const createLogCompileEventSink = (
  logger: CompileEventLogger
): CompileEventSink => ({
  write: (event) => {
    logger.info(
      { compile_event: normalizeCompileEventRecord(event) },
      "compile_event"
    );
  }
});

export const createMemoryCompileEventSink = (
  maxEvents = 200
): MemoryCompileEventSink => {
  const events: CompileEventRecord[] = [];

  return {
    write: (event) => {
      events.push(normalizeCompileEventRecord(event));
      if (events.length > Math.max(1, Math.floor(maxEvents))) {
        events.shift();
      }
    },
    clear: () => {
      events.length = 0;
    },
    readAll: () => [...events],
    readRecent: (query) => filterCompileEvents(events, query)
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
  readRecent: async (query) => {
    for (const sink of [...sinks].reverse()) {
      if (sink.readRecent) {
        return sink.readRecent(query);
      }
    }

    return [];
  }
});

export const readRecentCompileEvents = async (
  sink: CompileEventSink,
  query?: CompileEventQueryInput
): Promise<CompileEventRecord[]> => {
  if (!sink.readRecent) {
    return [];
  }

  return sink.readRecent(query);
};


export interface CompileTraceDetails {
  traceId: string;
  requestId: string;
  finalStatus: CompileFinalStatus;
  mode?: string;
  events: CompileEventRecord[];
}

export const readCompileTraceDetails = async (
  sink: CompileEventSink,
  traceId: string,
  limit = 100
): Promise<CompileTraceDetails | null> => {
  const normalizedTraceId = traceId.trim();
  if (!normalizedTraceId) {
    return null;
  }

  const events = await readRecentCompileEvents(sink, {
    limit,
    traceId: normalizedTraceId
  });
  if (events.length === 0) {
    return null;
  }

  const latest = events[0];
  return {
    traceId: normalizedTraceId,
    requestId: latest.requestId,
    finalStatus: latest.finalStatus,
    mode: latest.mode,
    events
  };
};
