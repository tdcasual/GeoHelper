import { describe, expect, it } from "vitest";

import {
  fromByokPreset,
  fromOfficialPreset,
  fromRuntimeProfile,
  makeEmptyByokDraft,
  makeEmptyOfficialDraft
} from "./settings-drawer-drafts";

describe("settings drawer drafts", () => {
  it("builds empty BYOK and official drafts with stable defaults", () => {
    expect(makeEmptyByokDraft()).toMatchObject({
      model: "gpt-4o-mini",
      temperature: "0.2"
    });
    expect(makeEmptyOfficialDraft()).toMatchObject({
      model: "gpt-4o-mini",
      temperature: "0.2"
    });
  });

  it("maps runtime and preset values into editable drafts", () => {
    expect(
      fromRuntimeProfile({
        id: "gateway-a",
        name: "Gateway A",
        target: "gateway",
        baseUrl: "https://gateway.example.com",
        updatedAt: 1
      })
    ).toMatchObject({
      id: "gateway-a",
      target: "gateway"
    });

    expect(
      fromByokPreset({
        id: "byok-a",
        name: "Byok A",
        model: "gpt-4o",
        endpoint: "https://example.com/v1",
        temperature: 0.6,
        maxTokens: 2048,
        timeoutMs: 30000,
        updatedAt: 1
      })
    ).toMatchObject({
      id: "byok-a",
      temperature: "0.6",
      maxTokens: "2048"
    });

    expect(
      fromOfficialPreset({
        id: "official-a",
        name: "Official A",
        model: "gpt-4.1-mini",
        temperature: 0.4,
        maxTokens: 1200,
        timeoutMs: 25000,
        updatedAt: 1
      })
    ).toMatchObject({
      id: "official-a",
      timeoutMs: "25000"
    });
  });
});
