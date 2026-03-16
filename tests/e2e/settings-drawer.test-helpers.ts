import { expect, type Page } from "@playwright/test";

import { createBackupEnvelope } from "../../packages/protocol/src";

type BackupFileInput = {
  schemaVersion?: number;
  appVersion?: string;
  createdAt?: string;
  updatedAt?: string;
  conversations?: Array<Record<string, unknown>>;
  settings?: Record<string, unknown>;
  invalidChecksum?: boolean;
};

export const createGatewayRemoteBackupSettingsSnapshot = () => ({
  schemaVersion: 3,
  defaultMode: "byok",
  runtimeProfiles: [
    {
      id: "runtime_gateway",
      name: "Gateway",
      target: "gateway",
      baseUrl: "https://gateway.example.com",
      updatedAt: 1
    },
    {
      id: "runtime_direct",
      name: "Direct BYOK",
      target: "direct",
      baseUrl: "https://openrouter.ai/api/v1",
      updatedAt: 1
    }
  ],
  defaultRuntimeProfileId: "runtime_gateway",
  byokPresets: [
    {
      id: "byok_default",
      name: "Default BYOK",
      model: "gpt-4o-mini",
      endpoint: "https://openrouter.ai/api/v1",
      temperature: 0.2,
      maxTokens: 1200,
      timeoutMs: 20000,
      updatedAt: 1
    }
  ],
  officialPresets: [
    {
      id: "official_default",
      name: "Official",
      model: "gpt-4o-mini",
      temperature: 0.2,
      maxTokens: 1200,
      timeoutMs: 20000,
      updatedAt: 1
    }
  ],
  defaultByokPresetId: "byok_default",
  defaultOfficialPresetId: "official_default",
  sessionOverrides: {},
  experimentFlags: {
    showAgentSteps: false,
    autoRetryEnabled: false,
    requestTimeoutEnabled: true,
    strictValidationEnabled: false,
    fallbackSingleAgentEnabled: false,
    debugLogPanelEnabled: false,
    performanceSamplingEnabled: false
  },
  requestDefaults: { retryAttempts: 1 },
  debugEvents: []
});

const createGatewayRemoteBackupChatSnapshot = () => ({
  mode: "byok",
  sessionToken: null,
  reauthRequired: false,
  activeConversationId: "conv_local",
  messages: [
    {
      id: "msg_local",
      role: "user",
      content: "local only"
    }
  ],
  conversations: [
    {
      id: "conv_local",
      title: "local only",
      createdAt: 1,
      updatedAt: 2,
      messages: [
        {
          id: "msg_local",
          role: "user",
          content: "local only"
        }
      ]
    }
  ]
});

const seedGatewayRemoteBackupSettingsImpl = async (page: Page, once: boolean) => {
  const settingsSnapshot = createGatewayRemoteBackupSettingsSnapshot();
  const chatSnapshot = createGatewayRemoteBackupChatSnapshot();

  await page.addInitScript(
    ({ chatSnapshot, once, settingsSnapshot }) => {
      if (once) {
        if (sessionStorage.getItem("__seeded_gateway_remote_backup_once__") === "1") {
          return;
        }
        sessionStorage.setItem("__seeded_gateway_remote_backup_once__", "1");
      }

      localStorage.setItem(
        "geohelper.settings.snapshot",
        JSON.stringify(settingsSnapshot)
      );
      localStorage.setItem("geohelper.chat.snapshot", JSON.stringify(chatSnapshot));
    },
    { once, settingsSnapshot, chatSnapshot }
  );
};

export const openWorkspace = async (page: Page) => {
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();
  await page
    .getByRole("button", { name: "设置" })
    .waitFor({ state: "visible", timeout: 20_000 });
};

export const openSettingsSection = async (
  page: Page,
  section: "模型与预设" | "数据与安全"
) => {
  await page.waitForLoadState("domcontentloaded");

  const settingsButton = page.getByRole("button", { name: "设置" });
  const settingsVisible = await settingsButton.isVisible().catch(() => false);

  if (!settingsVisible) {
    await openWorkspace(page);
  }

  await settingsButton.waitFor({ state: "visible", timeout: 20_000 });
  await settingsButton.click();
  await page.getByRole("button", { name: section, exact: true }).click();
};

export const seedGatewayRemoteBackupSettings = async (page: Page) =>
  seedGatewayRemoteBackupSettingsImpl(page, false);

export const seedGatewayRemoteBackupSettingsOnce = async (page: Page) =>
  seedGatewayRemoteBackupSettingsImpl(page, true);

export const saveGatewayAdminToken = async (page: Page) => {
  await openSettingsSection(page, "数据与安全");
  await page.getByRole("textbox", { name: "管理员令牌" }).fill("admin-secret");
  await page.getByRole("button", { name: "保存管理员令牌" }).click();
  await expect(page.getByText("网关管理员令牌已保存")).toBeVisible();
};

export const createBackupFile = (input: BackupFileInput) => {
  const createdAt = input.createdAt ?? "2026-03-05T00:00:00.000Z";
  const envelope = createBackupEnvelope(
    {
      conversations: input.conversations ?? [],
      settings: input.settings ?? {}
    },
    {
      schemaVersion: input.schemaVersion ?? 1,
      createdAt,
      updatedAt: input.updatedAt ?? createdAt,
      appVersion: input.appVersion ?? "0.0.1",
      snapshotId: "snap_e2e_backup",
      deviceId: "device_e2e_backup"
    }
  );
  const body = JSON.stringify(
    input.invalidChecksum
      ? {
          ...envelope,
          checksum: "deadbeef"
        }
      : envelope,
    null,
    2
  );

  return {
    name: "geochat-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(body, "utf-8")
  };
};
