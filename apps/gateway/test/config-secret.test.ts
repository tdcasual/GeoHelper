import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config";

describe("gateway config secret derivation", () => {
  it("derives stable session secret from app secret", () => {
    const configA = loadConfig({
      APP_SECRET: "app-secret-1"
    });
    const configB = loadConfig({
      APP_SECRET: "app-secret-1"
    });
    const configC = loadConfig({
      APP_SECRET: "app-secret-2"
    });

    expect(configA.sessionSecret).toBe(configB.sessionSecret);
    expect(configA.sessionSecret).not.toBe(configC.sessionSecret);
  });

  it("uses explicit session secret when provided", () => {
    const config = loadConfig({
      APP_SECRET: "app-secret-1",
      SESSION_SECRET: "explicit-session-secret"
    });

    expect(config.sessionSecret).toBe("explicit-session-secret");
  });
});
