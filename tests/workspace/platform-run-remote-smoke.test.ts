import fs from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  buildPlatformRunRemoteChecks,
  runPlatformRunRemoteSmoke
} from "../../scripts/smoke/platform-run-remote.mjs";

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

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });

describe("remote platform-run smoke", () => {
  it("exposes a package script and dry-run contract for the official flow", async () => {
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(packageJson.scripts?.["smoke:platform-run-remote"]).toBeDefined();

    const checks = buildPlatformRunRemoteChecks();

    expect(checks).toEqual([
      {
        name: "POST /api/v1/auth/token/login",
        method: "POST",
        path: "/api/v1/auth/token/login"
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
    ]);

    const buffer = createStdoutBuffer();
    const code = await runPlatformRunRemoteSmoke({
      argv: ["--dry-run"],
      env: {
        ...process.env,
        PRESET_TOKEN: "preset-token"
      },
      stdout: buffer.stdout as unknown as typeof process.stdout
    });

    expect(code).toBe(0);
    expect(JSON.parse(buffer.read())).toEqual({
      dry_run: true,
      gateway_url: null,
      control_plane_url: null,
      checks: [
        {
          name: "POST /api/v1/auth/token/login",
          method: "POST",
          path: "/api/v1/auth/token/login"
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

  it("runs the remote official platform flow and reports deterministic metadata", async () => {
    const buffer = createStdoutBuffer();
    const fetchImpl = vi.fn(
      async (input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
        const url = String(input);

        if (url.endsWith("/api/v1/auth/token/login")) {
          expect(init?.method).toBe("POST");
          return jsonResponse({
            session_token: "session-token",
            expires_in: 1800,
            token_type: "Bearer"
          });
        }

        if (url.endsWith("/api/v3/threads")) {
          return jsonResponse({
            thread: {
              id: "thread_platform_remote_1",
              title: "Remote platform run smoke",
              createdAt: "2026-04-09T00:00:00.000Z"
            }
          });
        }

        if (url.endsWith("/api/v3/threads/thread_platform_remote_1/runs")) {
          expect(init?.method).toBe("POST");
          expect(init?.headers).toEqual(
            expect.objectContaining({
              authorization: "Bearer session-token",
              "content-type": "application/json"
            })
          );

          return jsonResponse({
            run: {
              id: "run_platform_remote_1",
              status: "completed"
            }
          });
        }

        if (url.endsWith("/api/v3/runs/run_platform_remote_1/stream")) {
          return new Response(
            [
              "event: run.snapshot",
              `data: ${JSON.stringify({
                run: {
                  id: "run_platform_remote_1",
                  threadId: "thread_platform_remote_1",
                  profileId: "platform_geometry_standard",
                  status: "completed",
                  inputArtifactIds: [],
                  outputArtifactIds: ["artifact_response_1"]
                },
                events: [
                  {
                    id: "event_1",
                    runId: "run_platform_remote_1",
                    sequence: 1,
                    type: "run.completed",
                    payload: {},
                    createdAt: "2026-04-09T00:00:05.000Z"
                  }
                ],
                artifacts: [
                  {
                    id: "artifact_response_1",
                    runId: "run_platform_remote_1",
                    kind: "response",
                    contentType: "application/json",
                    storage: "inline",
                    metadata: {},
                    inlineData: {
                      title: "Remote geometry result"
                    },
                    createdAt: "2026-04-09T00:00:05.000Z"
                  }
                ]
              })}`,
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

        throw new Error(`Unexpected request: ${url}`);
      }
    );

    const code = await runPlatformRunRemoteSmoke({
      env: {
        ...process.env,
        GATEWAY_URL: "https://gateway.example.com",
        CONTROL_PLANE_URL: "https://control-plane.example.com",
        PRESET_TOKEN: "preset-token"
      },
      fetchImpl,
      stdout: buffer.stdout as unknown as typeof process.stdout
    });

    expect(code).toBe(0);
    expect(JSON.parse(buffer.read())).toEqual({
      dry_run: false,
      gateway_url: "https://gateway.example.com",
      control_plane_url: "https://control-plane.example.com",
      checks: [
        {
          name: "POST /api/v1/auth/token/login",
          ok: true
        },
        {
          name: "POST /api/v3/threads",
          ok: true,
          thread_id: "thread_platform_remote_1"
        },
        {
          name: "POST /api/v3/threads/:threadId/runs",
          ok: true,
          run_id: "run_platform_remote_1",
          run_status: "completed"
        },
        {
          name: "GET /api/v3/runs/:runId/stream",
          ok: true,
          run_id: "run_platform_remote_1",
          final_status: "completed",
          artifact_count: 1,
          event_count: 1
        }
      ]
    });
  });
});
