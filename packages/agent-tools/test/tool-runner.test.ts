import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createToolRegistry, createToolRunner } from "../src";

describe("tool runner", () => {
  it("validates tool input with the registered schema", async () => {
    const registry = createToolRegistry([
      {
        name: "math.add_one",
        kind: "worker_tool",
        permissions: ["math:read"],
        retryable: false,
        inputSchema: z.object({
          value: z.number()
        }),
        outputSchema: z.object({
          value: z.number()
        }),
        execute: async ({ value }) => ({
          value: value + 1
        })
      }
    ]);

    const runner = createToolRunner({
      registry,
      allowedPermissions: ["math:read"]
    });

    await expect(
      runner.run("math.add_one", {
        value: "1"
      })
    ).rejects.toThrow("invalid_tool_input");
  });

  it("rejects tool calls when required permissions are missing", async () => {
    const registry = createToolRegistry([
      {
        name: "secret.read",
        kind: "server_tool",
        permissions: ["secret:read"],
        retryable: false,
        inputSchema: z.object({}),
        outputSchema: z.object({
          value: z.string()
        }),
        execute: async () => ({
          value: "classified"
        })
      }
    ]);

    const runner = createToolRunner({
      registry,
      allowedPermissions: []
    });

    await expect(runner.run("secret.read", {})).rejects.toThrow(
      "tool_permission_denied"
    );
  });

  it("retries retryable tools until they succeed within the configured limit", async () => {
    let attempts = 0;
    const registry = createToolRegistry([
      {
        name: "unstable.fetch",
        kind: "external_tool",
        permissions: ["fetch:read"],
        retryable: true,
        inputSchema: z.object({}),
        outputSchema: z.object({
          ok: z.boolean(),
          attempts: z.number()
        }),
        execute: async () => {
          attempts += 1;
          if (attempts < 2) {
            throw new Error("temporary_failure");
          }

          return {
            ok: true,
            attempts
          };
        }
      }
    ]);

    const runner = createToolRunner({
      registry,
      allowedPermissions: ["fetch:read"],
      providers: {
        external: {
          invoke: async ({ tool, input }) => tool.execute(input)
        }
      },
      retryPolicy: {
        maxAttempts: 2
      }
    });

    const result = await runner.run("unstable.fetch", {});

    expect(result.output).toEqual({
      ok: true,
      attempts: 2
    });
    expect(result.attemptCount).toBe(2);
  });

  it("redacts configured audit fields from captured tool input and output", async () => {
    const registry = createToolRegistry([
      {
        name: "auth.exchange",
        kind: "server_tool",
        permissions: ["auth:exchange"],
        retryable: false,
        redactPaths: ["apiKey", "token"],
        inputSchema: z.object({
          apiKey: z.string()
        }),
        outputSchema: z.object({
          token: z.string(),
          expiresIn: z.number()
        }),
        execute: async () => ({
          token: "secret_token",
          expiresIn: 3600
        })
      }
    ]);

    const runner = createToolRunner({
      registry,
      allowedPermissions: ["auth:exchange"]
    });

    const result = await runner.run("auth.exchange", {
      apiKey: "sk-secret"
    });

    expect(result.audit.input).toEqual({
      apiKey: "[REDACTED]"
    });
    expect(result.audit.output).toEqual({
      token: "[REDACTED]",
      expiresIn: 3600
    });
  });

  it("routes browser tools through the browser provider instead of local execute", async () => {
    const registry = createToolRegistry([
      {
        name: "scene.read_state",
        kind: "browser_tool",
        permissions: ["scene:read"],
        retryable: false,
        inputSchema: z.object({
          sessionId: z.string()
        }),
        outputSchema: z.object({
          objects: z.array(z.string())
        }),
        execute: async () => {
          throw new Error("should_not_use_local_execute");
        }
      }
    ]);

    const runner = createToolRunner({
      registry,
      allowedPermissions: ["scene:read"],
      providers: {
        browser: {
          invoke: async ({ input }) => ({
            objects: [`session:${(input as { sessionId: string }).sessionId}`]
          })
        }
      }
    });

    await expect(
      runner.run("scene.read_state", {
        sessionId: "browser_1"
      })
    ).resolves.toEqual(
      expect.objectContaining({
        output: {
          objects: ["session:browser_1"]
        }
      })
    );
  });

  it("fails when an external tool has no matching provider", async () => {
    const registry = createToolRegistry([
      {
        name: "remote.search",
        kind: "external_tool",
        permissions: ["search:read"],
        retryable: false,
        inputSchema: z.object({
          query: z.string()
        }),
        outputSchema: z.object({
          result: z.string()
        }),
        execute: async () => ({
          result: "should_not_run"
        })
      }
    ]);

    const runner = createToolRunner({
      registry,
      allowedPermissions: ["search:read"]
    });

    await expect(
      runner.run("remote.search", {
        query: "triangle"
      })
    ).rejects.toThrow("tool_provider_missing");
  });

  it("fails timed out tool calls with a stable timeout error", async () => {
    const registry = createToolRegistry([
      {
        name: "slow.remote_fetch",
        kind: "external_tool",
        permissions: ["fetch:read"],
        retryable: false,
        timeoutMs: 5,
        inputSchema: z.object({}),
        outputSchema: z.object({
          ok: z.boolean()
        }),
        execute: async () => ({
          ok: true
        })
      }
    ]);

    const runner = createToolRunner({
      registry,
      allowedPermissions: ["fetch:read"],
      providers: {
        external: {
          invoke: async () =>
            await new Promise((resolve) => {
              setTimeout(() => {
                resolve({
                  ok: true
                });
              }, 20);
            })
        }
      }
    });

    await expect(runner.run("slow.remote_fetch", {})).rejects.toThrow(
      "tool_timeout"
    );
  });
});
