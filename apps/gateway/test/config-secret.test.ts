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

  it("parses attachment capability from explicit env flag", () => {
    expect(
      loadConfig({
        GATEWAY_ENABLE_ATTACHMENTS: "1"
      }).attachmentsEnabled
    ).toBe(true);

    expect(
      loadConfig({
        GATEWAY_ENABLE_ATTACHMENTS: "0"
      }).attachmentsEnabled
    ).toBe(false);

    expect(loadConfig({}).attachmentsEnabled).toBe(false);
  });

  it("fails fast in production when app secret is missing", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        LITELLM_ENDPOINT: "https://litellm.example.com"
      })
    ).toThrow("APP_SECRET_REQUIRED");
  });

  it("fails fast in production when LiteLLM endpoint is missing", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        APP_SECRET: "prod-app-secret"
      })
    ).toThrow("LITELLM_ENDPOINT_REQUIRED");
  });

  it("keeps safe development defaults outside production", () => {
    const config = loadConfig({});

    expect(config.appSecret).toBe("geohelper-dev-app-secret");
    expect(config.sessionTtlSeconds).toBe(1800);
    expect(config.rateLimitMax).toBe(120);
  });

  it("parses explicit backup retention limits and keeps bounded defaults", () => {
    const defaults = loadConfig({}) as ReturnType<typeof loadConfig> & {
      backupMaxHistory: number;
      backupMaxProtected: number;
    };
    const configured = loadConfig({
      BACKUP_MAX_HISTORY: "7",
      BACKUP_MAX_PROTECTED: "33"
    }) as ReturnType<typeof loadConfig> & {
      backupMaxHistory: number;
      backupMaxProtected: number;
    };

    expect(defaults.backupMaxHistory).toBe(10);
    expect(defaults.backupMaxProtected).toBe(20);
    expect(configured.backupMaxHistory).toBe(7);
    expect(configured.backupMaxProtected).toBe(33);
  });
});
