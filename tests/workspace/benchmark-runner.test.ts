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
        gateway_attachments: string;
        vision_smoke_required_when_enabled: boolean;
      };
    };

    expect(payload.dry_run).toBe(true);
    expect(payload.capability_gates).toEqual({
      gateway_attachments: "explicit_flag",
      vision_smoke_required_when_enabled: true
    });
    expect(payload.total_cases).toBe(80);
    expect(payload.by_domain["2d"]).toBe(20);
    expect(payload.by_domain["3d"]).toBe(20);
    expect(payload.by_domain.cas).toBe(20);
    expect(payload.by_domain.probability).toBe(20);
  });

  it("posts benchmark cases to the v2 agent run endpoint and scores agent_run drafts", async () => {
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
          body: JSON.parse(body)
        });
        res.writeHead(200, {
          "content-type": "application/json"
        });
        res.end(
          JSON.stringify({
            trace_id: "tr_bench_1",
            agent_run: {
              run: {
                id: "run_bench_1",
                status: "success"
              },
              draft: {
                commandBatchDraft: {
                  version: "1.0",
                  scene_id: "scene_1",
                  transaction_id: "tx_bench_1",
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
          })
        );
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
          "--gateway-url",
          `http://127.0.0.1:${port}`,
          "--output",
          outputPath
        ]);

      expect(run.status).toBe(0);
      expect(run.stderr).toBe("");
      expect(requests).toEqual([
        {
          method: "POST",
          url: "/api/v2/agent/runs",
          body: {
            message: "画一个圆",
            mode: "byok"
          }
        }
      ]);

      const payload = JSON.parse(fs.readFileSync(outputPath, "utf8")) as {
        gateway_url: string;
        total_cases: number;
        success_cases: number;
        failed_cases: number;
        success_rate: number;
      };

      expect(payload.gateway_url).toBe(`http://127.0.0.1:${port}`);
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
