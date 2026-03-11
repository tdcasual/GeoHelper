import { KvClient } from "./kv-client";
import {
  CompileEventQueryInput,
  CompileEventRecord,
  CompileEventSink,
  filterCompileEvents,
  normalizeCompileEventRecord
} from "./compile-events";

interface RedisCompileEventSinkOptions {
  key?: string;
  maxEvents?: number;
  ttlSeconds?: number;
}

const DEFAULT_COMPILE_EVENT_KEY = "geohelper:compile-events";
const DEFAULT_COMPILE_EVENT_MAX_EVENTS = 200;
const DEFAULT_COMPILE_EVENT_TTL_SECONDS = 86400;

const readStoredEvents = async (
  kvClient: KvClient,
  key: string
): Promise<CompileEventRecord[]> => {
  const raw = await kvClient.get(key);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as CompileEventRecord[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map((event) => normalizeCompileEventRecord(event));
  } catch {
    return [];
  }
};

export const createRedisCompileEventSink = (
  kvClient: KvClient,
  options: RedisCompileEventSinkOptions = {}
): CompileEventSink => {
  const key = options.key ?? DEFAULT_COMPILE_EVENT_KEY;
  const maxEvents = Math.max(
    1,
    Math.floor(options.maxEvents ?? DEFAULT_COMPILE_EVENT_MAX_EVENTS)
  );
  const ttlSeconds = Math.max(
    1,
    Math.floor(options.ttlSeconds ?? DEFAULT_COMPILE_EVENT_TTL_SECONDS)
  );

  return {
    write: async (event) => {
      const storedEvents = await readStoredEvents(kvClient, key);
      const nextEvents = [...storedEvents, normalizeCompileEventRecord(event)].slice(
        -maxEvents
      );
      await kvClient.set(key, JSON.stringify(nextEvents), {
        ttlSeconds
      });
    },
    readRecent: async (query?: CompileEventQueryInput) => {
      const storedEvents = await readStoredEvents(kvClient, key);
      return filterCompileEvents(storedEvents, query);
    }
  };
};
