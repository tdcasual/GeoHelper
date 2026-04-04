import { describe, expect, it, vi } from "vitest";

import {
  buildGatewayRuntimeChecks,
  runGatewayRuntimeSmoke
} from "../../scripts/smoke/gateway-runtime.mjs";

const createStdoutBuffer = () => {
  let output = "";
  return {
    stdout: {
      write(chunk: string) {
        output += chunk;
        return true;
      }
    },
    read: () => output
  };
};

const jsonResponse = (
  payload: unknown,
  options: {
    status?: number;
    headers?: Record<string, string>;
  } = {}
) =>
  new Response(JSON.stringify(payload), {
    status: options.status ?? 200,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {})
    }
  });

const runSnapshotPayload = {
  run: {
    id: "run_platform_1",
    threadId: "thread_platform_1",
    workflowId: "wf_geometry_solver",
    agentId: "geometry_solver",
    status: "completed",
    inputArtifactIds: [],
    outputArtifactIds: ["artifact_response_1"],
    budget: {
      maxModelCalls: 6,
      maxToolCalls: 8,
      maxDurationMs: 120000
    },
    createdAt: "2026-04-04T00:00:00.000Z",
    updatedAt: "2026-04-04T00:00:05.000Z"
  },
  events: [
    {
      id: "event_1",
      runId: "run_platform_1",
      sequence: 1,
      type: "run.created",
      payload: {},
      createdAt: "2026-04-04T00:00:00.000Z"
    },
    {
      id: "event_2",
      runId: "run_platform_1",
      sequence: 2,
      type: "run.completed",
      payload: {},
      createdAt: "2026-04-04T00:00:05.000Z"
    }
  ],
  checkpoints: [],
  artifacts: [
    {
      id: "artifact_draft_1",
      runId: "run_platform_1",
      kind: "draft",
      contentType: "application/json",
      storage: "inline",
      metadata: {},
      inlineData: {
        title: "几何草案"
      },
      createdAt: "2026-04-04T00:00:03.000Z"
    },
    {
      id: "artifact_response_1",
      runId: "run_platform_1",
      kind: "response",
      contentType: "application/json",
      storage: "inline",
      metadata: {},
      inlineData: {
        title: "几何结果"
      },
      createdAt: "2026-04-04T00:00:04.000Z"
    },
    {
      id: "artifact_tool_1",
      runId: "run_platform_1",
      kind: "tool_result",
      contentType: "application/json",
      storage: "inline",
      metadata: {
        commandCount: 1
      },
      inlineData: {
        commandBatch: {
          commands: [{ name: "noop" }]
        }
      },
      createdAt: "2026-04-04T00:00:02.000Z"
    }
  ],
  memoryEntries: []
};

describe("gateway runtime platform smoke", () => {
  it("describes platform run checks in dry-run mode", async () => {
    const buffer = createStdoutBuffer();
    const env = {
      ...process.env,
      ADMIN_METRICS_TOKEN: "admin-token",
      PRESET_TOKEN: "preset-token"
    };

    const checks = buildGatewayRuntimeChecks(env);
    expect(checks).toContainEqual({
      name: "POST /api/v3/threads",
      method: "POST",
      path: "/api/v3/threads"
    });

    const code = await runGatewayRuntimeSmoke({
      argv: ["--dry-run"],
      env,
      stdout: buffer.stdout as unknown as typeof process.stdout
    });

    expect(code).toBe(0);
    expect(JSON.parse(buffer.read())).toEqual({
      dry_run: true,
      gateway_url: null,
      control_plane_url: null,
      checks: [
        {
          name: "GET /api/v1/health",
          method: "GET",
          path: "/api/v1/health"
        },
        {
          name: "GET /api/v1/ready",
          method: "GET",
          path: "/api/v1/ready"
        },
        {
          name: "GET /admin/version",
          method: "GET",
          path: "/admin/version"
        },
        {
          name: "POST /api/v1/auth/token/login",
          method: "POST",
          path: "/api/v1/auth/token/login"
        },
        {
          name: "POST /api/v1/auth/token/revoke",
          method: "POST",
          path: "/api/v1/auth/token/revoke"
        },
        {
          name: "POST /api/v3/threads",
          method: "POST",
          path: "/api/v3/threads"
        },
        {
          name: "POST /api/v3/threads/:threadId/runs",
          method: "POST",
          path: "/api/v3/threads/:threadId/runs"
        },
        {
          name: "GET /api/v3/runs/:runId/stream",
          method: "GET",
          path: "/api/v3/runs/:runId/stream"
        }
      ]
    });
  });

  it("emits deterministic platform run metadata for a completed snapshot", async () => {
    const buffer = createStdoutBuffer();
    const fetchImpl = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.endsWith("/api/v1/health")) {
        return jsonResponse({ status: "ok" });
      }
      if (url.endsWith("/api/v1/ready")) {
        return jsonResponse({ ready: true });
      }
      if (url.endsWith("/admin/version")) {
        return jsonResponse({
          git_sha: "sha123",
          build_time: "2026-03-12T10:00:00.000Z",
          node_env: "production",
          redis_enabled: true,
          attachments_enabled: false
        });
      }
      if (url.endsWith("/api/v1/auth/token/login")) {
        return jsonResponse({
          session_token: "sess_smoke",
          expires_in: 1800,
          token_type: "Bearer"
        });
      }
      if (url.endsWith("/api/v1/auth/token/revoke")) {
        return jsonResponse({ revoked: true });
      }
      if (url.endsWith("/api/v3/threads")) {
        return jsonResponse({
          thread: {
            id: "thread_platform_1",
            title: "smoke thread",
            createdAt: "2026-04-04T00:00:00.000Z"
          }
        });
      }
      if (url.endsWith("/api/v3/threads/thread_platform_1/runs")) {
        return jsonResponse({
          run: runSnapshotPayload.run
        });
      }
      if (url.endsWith("/api/v3/runs/run_platform_1/stream")) {
        return new Response(
          [
            "event: run.snapshot",
            `data: ${JSON.stringify(runSnapshotPayload)}`,
            ""
          ].join("\n"),
          {
            status: 200,
            headers: {
              "content-type": "text/event-stream"
            }
          }
        );
      }

      throw new Error(`unexpected url: ${url}`);
    });

    const code = await runGatewayRuntimeSmoke({
      argv: ["--gateway-url", "https://gateway.example.com"],
      env: {
        ...process.env,
        ADMIN_METRICS_TOKEN: "admin-token",
        PRESET_TOKEN: "preset-token"
      },
      fetchImpl: fetchImpl as typeof fetch,
      stdout: buffer.stdout as unknown as typeof process.stdout
    });

    expect(code).toBe(0);
    const payload = JSON.parse(buffer.read()) as {
      dry_run: boolean;
      gateway_url: string;
      control_plane_url: string;
      checks: Array<Record<string, unknown>>;
    };

    expect(payload.dry_run).toBe(false);
    expect(payload.gateway_url).toBe("https://gateway.example.com");
    expect(payload.control_plane_url).toBe("https://gateway.example.com");
    expect(payload.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "GET /admin/version",
          ok: true,
          attachments_enabled: false
        }),
        expect.objectContaining({
          name: "POST /api/v3/threads",
          ok: true,
          thread_id: "thread_platform_1"
        }),
        expect.objectContaining({
          name: "POST /api/v3/threads/:threadId/runs",
          ok: true,
          run_id: "run_platform_1",
          run_status: "completed"
        }),
        expect.objectContaining({
          name: "GET /api/v3/runs/:runId/stream",
          ok: true,
          run_id: "run_platform_1",
          final_status: "completed",
          command_count: 1,
          artifact_count: 3,
          event_count: 2
        })
      ])
    );
  });
});
