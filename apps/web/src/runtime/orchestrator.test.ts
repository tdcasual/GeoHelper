import { describe, expect, it, vi } from "vitest";

import {
  createRuntimeOrchestrator,
  RuntimeApiError,
  RuntimeClient
} from "./orchestrator";
import { RuntimeCapabilities } from "./types";

const gatewayCapabilities: RuntimeCapabilities = {
  supportsOfficialAuth: true,
  supportsAgentSteps: true,
  supportsServerMetrics: true,
  supportsRateLimitHeaders: true
};

const directCapabilities: RuntimeCapabilities = {
  supportsOfficialAuth: false,
  supportsAgentSteps: false,
  supportsServerMetrics: false,
  supportsRateLimitHeaders: false
};

describe("runtime orchestrator", () => {
  it("routes compile calls by target", async () => {
    const gatewayCompile = vi.fn().mockResolvedValue({
      batch: {
        version: "1.0",
        scene_id: "s1",
        transaction_id: "t1",
        commands: [],
        post_checks: [],
        explanations: []
      }
    });
    const directCompile = vi.fn().mockResolvedValue({
      batch: {
        version: "1.0",
        scene_id: "s2",
        transaction_id: "t2",
        commands: [],
        post_checks: [],
        explanations: []
      }
    });

    const gatewayClient: RuntimeClient = {
      target: "gateway",
      capabilities: gatewayCapabilities,
      compile: gatewayCompile
    };
    const directClient: RuntimeClient = {
      target: "direct",
      capabilities: directCapabilities,
      compile: directCompile
    };

    const orchestrator = createRuntimeOrchestrator({
      gateway: gatewayClient,
      direct: directClient
    });

    await orchestrator.compile({
      target: "direct",
      mode: "byok",
      message: "画一个圆"
    });

    expect(directCompile).toHaveBeenCalledTimes(1);
    expect(gatewayCompile).not.toHaveBeenCalled();
  });

  it("blocks official mode on direct target", async () => {
    const directClient: RuntimeClient = {
      target: "direct",
      capabilities: directCapabilities,
      compile: vi.fn()
    };

    const orchestrator = createRuntimeOrchestrator({
      gateway: {
        target: "gateway",
        capabilities: gatewayCapabilities,
        compile: vi.fn()
      },
      direct: directClient
    });

    await expect(
      orchestrator.compile({
        target: "direct",
        mode: "official",
        message: "画一个圆"
      })
    ).rejects.toMatchObject({
      code: "RUNTIME_MODE_UNSUPPORTED"
    });
  });

  it("throws when target client is not registered", async () => {
    const orchestrator = createRuntimeOrchestrator({
      gateway: {
        target: "gateway",
        capabilities: gatewayCapabilities,
        compile: vi.fn()
      }
    });

    await expect(
      orchestrator.compile({
        target: "direct",
        mode: "byok",
        message: "画一个圆"
      })
    ).rejects.toBeInstanceOf(RuntimeApiError);
  });
});
