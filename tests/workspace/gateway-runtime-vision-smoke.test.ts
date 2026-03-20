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

describe("gateway runtime vision smoke", () => {
  it("describes optional attachment checks in dry-run mode when identity enables attachments", async () => {
    const buffer = createStdoutBuffer();
    const env = {
      ...process.env,
      ADMIN_METRICS_TOKEN: "admin-token",
      SMOKE_GATEWAY_IDENTITY_JSON: JSON.stringify({
        attachments_enabled: true
      })
    };

    const checks = buildGatewayRuntimeChecks(env);
    expect(checks).toContainEqual({
      name: "POST /api/v2/agent/runs (attachment)",
      method: "POST",
      path: "/api/v2/agent/runs",
      capability: "attachments"
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
          name: "POST /api/v2/agent/runs",
          method: "POST",
          path: "/api/v2/agent/runs"
        },
        {
          name: "POST /api/v2/agent/runs (attachment)",
          method: "POST",
          path: "/api/v2/agent/runs",
          capability: "attachments"
        },
        {
          name: "GET /admin/compile-events",
          method: "GET",
          path: "/admin/compile-events?limit=10"
        },
        {
          name: "GET /admin/metrics",
          method: "GET",
          path: "/admin/metrics"
        }
      ]
    });
  });

  it("emits deterministic attachment smoke metadata when runtime identity advertises support", async () => {
    const buffer = createStdoutBuffer();
    let metricsReadCount = 0;
    const fetchImpl = vi.fn(async (input: URL | RequestInfo, options?: RequestInit) => {
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
          attachments_enabled: true
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
      if (url.includes("/api/v2/agent/runs")) {
        const body = JSON.parse(String(options?.body ?? "{}")) as {
          attachments?: unknown[];
        };
        const attachmentCall = Array.isArray(body.attachments);
        const traceId = attachmentCall ? "tr_attachment" : "tr_compile";
        const runId = attachmentCall ? "run_attachment" : "run_compile";
        return jsonResponse(
          {
            trace_id: traceId,
            agent_run: {
              run: {
                id: runId,
                mode: "byok",
                status: "success"
              },
              draft: {
                commandBatchDraft: {
                  version: "1.0",
                  scene_id: "s1",
                  transaction_id: `tx_${runId}`,
                  commands: [{ name: "noop" }],
                  post_checks: [],
                  explanations: []
                }
              },
              telemetry: {
                stages: [
                  {
                    name: "author",
                    status: "ok",
                    durationMs: 8
                  }
                ]
              }
            }
          },
          {
            headers: {
              "x-trace-id": traceId
            }
          }
        );
      }
      if (url.includes("/admin/compile-events")) {
        return jsonResponse({
          events: [
            {
              traceId: "tr_compile",
              finalStatus: "success"
            }
          ]
        });
      }
      if (url.endsWith("/admin/metrics")) {
        metricsReadCount += 1;
        return jsonResponse({
          compile: {
            total_requests: metricsReadCount === 1 ? 5 : 7
          }
        });
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
      checks: Array<Record<string, unknown>>;
    };

    expect(payload.dry_run).toBe(false);
    expect(payload.gateway_url).toBe("https://gateway.example.com");
    expect(payload.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "GET /admin/version",
          ok: true,
          attachments_enabled: true
        }),
        expect.objectContaining({
          name: "POST /api/v2/agent/runs",
          ok: true,
          trace_id: "tr_compile",
          run_id: "run_compile",
          command_count: 1,
          telemetry_stages: 1
        }),
        expect.objectContaining({
          name: "POST /api/v2/agent/runs (attachment)",
          ok: true,
          attachments_count: 1,
          trace_id: "tr_attachment",
          run_id: "run_attachment",
          command_count: 1,
          telemetry_stages: 1
        }),
        expect.objectContaining({
          name: "GET /admin/metrics",
          ok: true,
          total_requests_before: 5,
          total_requests_after: 7,
          total_requests_expected_min: 7
        })
      ])
    );
  });
});
