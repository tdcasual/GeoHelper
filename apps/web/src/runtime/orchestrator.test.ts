import { describe, expect, it, vi } from "vitest";

import {
  createRuntimeOrchestrator,
  RuntimeApiError,
  RuntimeClient
} from "./orchestrator";
import { RuntimeCapabilities } from "./types";

const gatewayCapabilities: RuntimeCapabilities = {
  supportsOfficialAuth: true,
  supportsVision: false,
  supportsAgentSteps: true,
  supportsServerMetrics: true,
  supportsRateLimitHeaders: true
};

const directCapabilities: RuntimeCapabilities = {
  supportsOfficialAuth: false,
  supportsVision: true,
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

  it("consults gateway capability resolver before attachment compile", async () => {
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
    const resolveCapabilities = vi.fn().mockResolvedValue({
      ...gatewayCapabilities,
      supportsVision: true
    });

    const gatewayClient = {
      target: "gateway" as const,
      capabilities: gatewayCapabilities,
      resolveCapabilities,
      compile: gatewayCompile
    } as RuntimeClient & {
      resolveCapabilities?: (params: {
        baseUrl?: string;
        model?: string;
      }) => Promise<RuntimeCapabilities>;
    };

    const orchestrator = createRuntimeOrchestrator({
      gateway: gatewayClient
    });

    await orchestrator.compile({
      target: "gateway",
      baseUrl: "https://gateway.example.com",
      mode: "byok",
      message: "根据图片画出三角形",
      attachments: [
        {
          id: "img_1",
          kind: "image",
          name: "triangle.png",
          mimeType: "image/png",
          size: 1234,
          transportPayload: "data:image/png;base64,AAAA"
        }
      ]
    });

    expect(resolveCapabilities).toHaveBeenCalledWith({
      baseUrl: "https://gateway.example.com",
      model: undefined
    });
    expect(gatewayCompile).toHaveBeenCalledTimes(1);
  });

  it("blocks attachments on direct runtime when model lacks vision support", async () => {
    const directClient: RuntimeClient = {
      target: "direct",
      capabilities: directCapabilities,
      compile: vi.fn()
    };

    const orchestrator = createRuntimeOrchestrator({
      direct: directClient,
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
        model: "gpt-4.1-mini",
        message: "根据图片画出三角形",
        attachments: [
          {
            id: "img_1",
            kind: "image",
            name: "triangle.png",
            mimeType: "image/png",
            size: 1234,
            transportPayload: "data:image/png;base64,AAAA"
          }
        ]
      })
    ).rejects.toMatchObject({
      code: "RUNTIME_ATTACHMENTS_UNSUPPORTED"
    });
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
