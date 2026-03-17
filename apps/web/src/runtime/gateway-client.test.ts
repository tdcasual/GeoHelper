import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createGatewayClient } from "./gateway-client";

const createAgentRunEnvelope = () => ({
  run: {
    id: "run_1",
    target: "gateway" as const,
    mode: "official" as const,
    status: "success" as const,
    iterationCount: 1,
    startedAt: "2026-03-17T10:00:00.000Z",
    finishedAt: "2026-03-17T10:00:01.000Z",
    totalDurationMs: 1000
  },
  draft: {
    normalizedIntent: "画一个圆",
    assumptions: [],
    constructionPlan: ["先确定圆心", "再确定半径"],
    namingPlan: ["O", "A"],
    commandBatchDraft: {
      version: "1.0",
      scene_id: "scene_1",
      transaction_id: "tx_1",
      commands: [],
      post_checks: [],
      explanations: ["已生成圆的草案"]
    },
    teachingOutline: ["说明圆心和半径"],
    reviewChecklist: ["检查半径是否一致"]
  },
  reviews: [],
  evidence: {
    preflight: {
      status: "passed" as const,
      issues: [],
      referencedLabels: ["O", "A"],
      generatedLabels: ["O", "A"]
    }
  },
  teacherPacket: {
    summary: ["已生成圆的草案"],
    warnings: [],
    uncertainties: [],
    nextActions: ["执行到画布"],
    canvasLinks: []
  },
  telemetry: {
    upstreamCallCount: 1,
    degraded: false,
    stages: []
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("gateway runtime client facade", () => {
  it("calls gateway compile endpoint with auth and byok headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        trace_id: "tr_1",
        agent_run: createAgentRunEnvelope()
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createGatewayClient();
    const result = await client.compile({
      target: "gateway",
      baseUrl: "https://gateway.example.com",
      mode: "official",
      sessionToken: "sess_x",
      message: "画一个圆",
      byokEndpoint: "https://proxy.example.com/v1",
      byokKey: "sk-test"
    });

    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(call[0]).toBe("https://gateway.example.com/api/v2/agent/runs");
    expect(call[1].headers).toMatchObject({
      authorization: "Bearer sess_x",
      "x-byok-endpoint": "https://proxy.example.com/v1",
      "x-byok-key": "sk-test"
    });
    expect(result.agent_run.teacherPacket.summary).toEqual(["已生成圆的草案"]);
  });

  it("keeps the gateway client facade suite below the test maintainability budget", async () => {
    const code = await readFile(new URL("./gateway-client.test.ts", import.meta.url), "utf-8");
    expect(code.split(/\r?\n/).length).toBeLessThan(260);
  });
});
