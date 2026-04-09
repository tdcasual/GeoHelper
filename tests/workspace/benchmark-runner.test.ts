import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

const runNodeScript = async (args: string[]) =>
  await new Promise<{
    status: number | null;
    stdout: string;
    stderr: string;
  }>((resolve, reject) => {
    const child = spawn("node", args, {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (status) => {
      resolve({
        status,
        stdout,
        stderr
      });
    });
  });

describe("quality benchmark runner", () => {
  it("exposes bench script and supports dry run summary output", () => {
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(packageJson.scripts?.["bench:quality"]).toBeDefined();

    const run = spawnSync(
      "node",
      ["scripts/bench/run-quality-benchmark.mjs", "--dry-run"],
      {
        encoding: "utf8"
      }
    );

    expect(run.status).toBe(0);
    const payload = JSON.parse(run.stdout.trim()) as {
      dry_run: boolean;
      total_cases: number;
      by_domain: Record<string, number>;
      capability_gates: {
        platform_runs: string;
        run_snapshot_required: boolean;
      };
    };

    expect(payload.dry_run).toBe(true);
    expect(payload.capability_gates).toEqual({
      platform_runs: "control_plane_v3",
      run_snapshot_required: true
    });
    expect(payload.total_cases).toBe(80);
    expect(payload.by_domain["2d"]).toBe(20);
    expect(payload.by_domain["3d"]).toBe(20);
    expect(payload.by_domain.cas).toBe(20);
    expect(payload.by_domain.probability).toBe(20);
  });

  it("posts benchmark cases to platform run endpoints and scores run snapshots", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "geohelper-benchmark-"));
    const casesPath = path.join(tempDir, "cases.json");
    const outputPath = path.join(tempDir, "result.json");
    const requests: Array<{
      method: string | undefined;
      url: string | undefined;
      body: Record<string, unknown>;
    }> = [];

    fs.writeFileSync(
      casesPath,
      JSON.stringify({
        cases: [
          {
            id: "case_1",
            domain: "2d",
            prompt: "画一个圆"
          }
        ]
      })
    );

    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => {
        body += String(chunk);
      });
      req.on("end", () => {
        requests.push({
          method: req.method,
          url: req.url,
          body: body ? JSON.parse(body) : {}
        });

        if (req.url === "/api/v3/ready") {
          res.writeHead(200, {
            "content-type": "application/json"
          });
          res.end(
            JSON.stringify({
              ready: true,
              service: "control-plane",
              executionMode: "inline_worker_loop",
              dependencies: []
            })
          );
          return;
        }

        if (req.url === "/api/v3/threads") {
          res.writeHead(201, {
            "content-type": "application/json"
          });
          res.end(
            JSON.stringify({
              thread: {
                id: "thread_bench_1",
                title: "case_1",
                createdAt: "2026-04-04T00:00:00.000Z"
              }
            })
          );
          return;
        }

        if (req.url === "/api/v3/threads/thread_bench_1/runs") {
          res.writeHead(202, {
            "content-type": "application/json"
          });
          res.end(
            JSON.stringify({
              run: {
                id: "run_bench_1",
                threadId: "thread_bench_1",
                profileId: "platform_geometry_standard",
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
              }
            })
          );
          return;
        }

        if (req.url === "/api/v3/runs/run_bench_1/stream") {
          res.writeHead(200, {
            "content-type": "text/event-stream"
          });
          res.end(
            [
              "event: run.snapshot",
              `data: ${JSON.stringify({
                run: {
                  id: "run_bench_1",
                  threadId: "thread_bench_1",
                  profileId: "platform_geometry_standard",
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
                events: [],
                checkpoints: [],
                artifacts: [
                  {
                    id: "artifact_tool_1",
                    runId: "run_bench_1",
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
              })}`,
              ""
            ].join("\n")
          );
        }
      });
    });

    try {
      await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", () => resolve());
      });

      const { port } = server.address() as AddressInfo;
      const run = await runNodeScript([
        "scripts/bench/run-quality-benchmark.mjs",
        "--cases",
        casesPath,
        "--control-plane-url",
        `http://127.0.0.1:${port}`,
        "--output",
        outputPath
      ]);

      expect(run.status).toBe(0);
      expect(run.stderr).toBe("");
      expect(requests).toEqual([
        {
          method: "GET",
          url: "/api/v3/ready",
          body: {}
        },
        {
          method: "POST",
          url: "/api/v3/threads",
          body: {
            title: "case_1"
          }
        },
        {
          method: "POST",
          url: "/api/v3/threads/thread_bench_1/runs",
          body: {
            profileId: "platform_geometry_standard",
            inputArtifactIds: []
          }
        },
        {
          method: "GET",
          url: "/api/v3/runs/run_bench_1/stream",
          body: {}
        }
      ]);

      const payload = JSON.parse(fs.readFileSync(outputPath, "utf8")) as {
        control_plane_url: string;
        total_cases: number;
        success_cases: number;
        failed_cases: number;
        success_rate: number;
      };

      expect(payload.control_plane_url).toBe(`http://127.0.0.1:${port}`);
      expect(payload.total_cases).toBe(1);
      expect(payload.success_cases).toBe(1);
      expect(payload.failed_cases).toBe(0);
      expect(payload.success_rate).toBe(1);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
