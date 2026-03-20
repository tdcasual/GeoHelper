import { describe, expect, it } from "vitest";

import {
  CompileEventRecord,
  readRecentCompileEvents
} from "../src/services/compile-events";
import { createMemoryKvClient } from "../src/services/kv-client";
import { createRedisCompileEventSink } from "../src/services/redis-compile-event-sink";

const createEvent = (
  requestId: string,
  traceId: string,
  overrides: Partial<CompileEventRecord> = {}
): CompileEventRecord => ({
  event: "compile_success",
  finalStatus: "success",
  traceId,
  requestId,
  path: "/api/v2/agent/runs",
  method: "POST",
  mode: "byok",
  statusCode: 200,
  upstreamCallCount: 1,
  ...overrides
});

describe("redis compile event sink", () => {
  it("retains bounded recent events across sink instances", async () => {
    const kvClient = createMemoryKvClient();
    const sink = createRedisCompileEventSink(kvClient, {
      key: "geohelper:test:compile-events",
      maxEvents: 2,
      ttlSeconds: 300
    });

    await sink.write(createEvent("req-1", "tr_req-1"));
    await sink.write(createEvent("req-2", "tr_req-2"));
    await sink.write(createEvent("req-3", "tr_req-3"));

    const reloadedSink = createRedisCompileEventSink(kvClient, {
      key: "geohelper:test:compile-events",
      maxEvents: 2,
      ttlSeconds: 300
    });

    await expect(
      readRecentCompileEvents(reloadedSink, { limit: 10 })
    ).resolves.toEqual([
      expect.objectContaining({ requestId: "req-3", traceId: "tr_req-3" }),
      expect.objectContaining({ requestId: "req-2", traceId: "tr_req-2" })
    ]);
  });

  it("supports stable trace filtering when unrelated events exist", async () => {
    const kvClient = createMemoryKvClient();
    const sink = createRedisCompileEventSink(kvClient, {
      key: "geohelper:test:compile-events:filters",
      maxEvents: 10,
      ttlSeconds: 300
    });

    await sink.write(createEvent("req-1", "tr_shared", { event: "compile_fallback", finalStatus: "fallback" }));
    await sink.write(createEvent("req-2", "tr_other"));
    await sink.write(createEvent("req-3", "tr_shared", { event: "compile_repair", finalStatus: "repair" }));

    await expect(
      readRecentCompileEvents(sink, {
        limit: 10,
        traceId: "tr_shared"
      })
    ).resolves.toEqual([
      expect.objectContaining({ requestId: "req-3", traceId: "tr_shared", event: "compile_repair" }),
      expect.objectContaining({ requestId: "req-1", traceId: "tr_shared", event: "compile_fallback" })
    ]);
  });
});
