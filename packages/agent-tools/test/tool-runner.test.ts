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
});
