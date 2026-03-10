import { describe, expect, it } from "vitest";

import { resolveUpstreamTargets } from "../src/services/model-router";

describe("model router", () => {
  it("keeps legacy single-endpoint behavior when no fallback is configured", () => {
    const targets = resolveUpstreamTargets(
      {},
      {
        LITELLM_ENDPOINT: "https://primary.example.com/",
        LITELLM_API_KEY: "primary-key",
        LITELLM_MODEL: "primary-model"
      }
    );

    expect(targets).toEqual([
      {
        endpoint: "https://primary.example.com",
        apiKey: "primary-key",
        model: "primary-model",
        source: "primary"
      }
    ]);
  });

  it("adds a fallback target when fallback env vars are configured", () => {
    const targets = resolveUpstreamTargets(
      {},
      {
        LITELLM_ENDPOINT: "https://primary.example.com",
        LITELLM_API_KEY: "primary-key",
        LITELLM_MODEL: "primary-model",
        LITELLM_FALLBACK_ENDPOINT: "https://fallback.example.com/",
        LITELLM_FALLBACK_API_KEY: "fallback-key",
        LITELLM_FALLBACK_MODEL: "fallback-model"
      }
    );

    expect(targets).toEqual([
      {
        endpoint: "https://primary.example.com",
        apiKey: "primary-key",
        model: "primary-model",
        source: "primary"
      },
      {
        endpoint: "https://fallback.example.com",
        apiKey: "fallback-key",
        model: "fallback-model",
        source: "fallback"
      }
    ]);
  });
});
