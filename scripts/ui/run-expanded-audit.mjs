import fs from "node:fs";
import path from "node:path";

import { chromium } from "@playwright/test";

import { filterViewportButtonViolations } from "./lib/offscreen-buttons.mjs";

const baseUrl = process.env.UI_AUDIT_BASE_URL ?? "http://127.0.0.1:4173";

function formatStamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-local-ui-audit-expanded-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

const outDir = process.argv[2] ?? path.join("output/playwright", formatStamp());
const namedDir = path.join(outDir, "named");
fs.mkdirSync(namedDir, { recursive: true });

function nowMinus(minutes) {
  return Date.now() - minutes * 60_000;
}

function makeLongText(label, repeat = 16) {
  return `${label} ` + Array.from({ length: repeat }, (_, index) => `第${index + 1}段内容用于测试滚动与换行表现`).join("，");
}

function makeLongToken(prefix, repeat = 10) {
  return `${prefix}_` + "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".repeat(repeat);
}

function makeChatSnapshot() {
  const conv1 = {
    id: "conv_long_active",
    title: "这是一个非常长的会话标题用于测试历史列表在窄屏和覆盖抽屉里的换行与截断策略是否稳定",
    createdAt: nowMinus(120),
    updatedAt: nowMinus(1),
    messages: [
      {
        id: "m1",
        role: "user",
        content: makeLongText("请根据如下条件绘制几何对象，并给出逐步解释", 12)
      },
      {
        id: "m2",
        role: "assistant",
        content:
          makeLongText("已为你生成草图，同时补充一段超长不可断行 token 用于测试", 10) +
          "\n" +
          makeLongToken("UNBROKEN", 18),
        traceId: "trace-long-1",
        agentSteps: [
          {
            name: "analysis-and-normalization-step-with-very-long-name-to-test-grid-wrapping-behavior-in-mobile-layout",
            status: "ok",
            duration_ms: 1380
          },
          {
            name: "constraint-solver-and-geo-construction-planning-step-with-very-long-name",
            status: "fallback",
            duration_ms: 2840
          },
          {
            name: "render-command-generation-step-with-additional-context-and-metadata",
            status: "error",
            duration_ms: 5120
          }
        ]
      }
    ]
  };

  const conversations = [
    conv1,
    ...Array.from({ length: 14 }, (_, index) => ({
      id: `conv_${index + 2}`,
      title: `历史会话 ${index + 2} - 这是为了测试超长标题在列表中的显示情况 ${"扩展".repeat((index % 4) + 2)}`,
      createdAt: nowMinus(400 + index),
      updatedAt: nowMinus(20 + index),
      messages: [
        {
          id: `msg_${index + 2}`,
          role: "user",
          content: `会话 ${index + 2}`
        }
      ]
    }))
  ];

  return {
    mode: "byok",
    sessionToken: null,
    conversations,
    activeConversationId: conv1.id,
    messages: conv1.messages,
    reauthRequired: false
  };
}

function makeSettingsSnapshot() {
  const now = Date.now();
  return {
    schemaVersion: 3,
    defaultMode: "byok",
    runtimeProfiles: [
      { id: "runtime_gateway", name: "Gateway", target: "gateway", baseUrl: "", updatedAt: now },
      { id: "runtime_direct", name: "Direct BYOK", target: "direct", baseUrl: "", updatedAt: now }
    ],
    defaultRuntimeProfileId: "runtime_gateway",
    byokPresets: [
      {
        id: "byok_default",
        name: "默认 BYOK",
        model: "gpt-4o-mini",
        endpoint: "https://example.com/v1",
        temperature: 0.2,
        maxTokens: 1200,
        timeoutMs: 20000,
        updatedAt: now
      },
      {
        id: "byok_long",
        name: "这是一个超长的 BYOK 预设名称用于测试 select 与表单布局在手机端的表现",
        model: "anthropic/claude-sonnet-very-long-model-name-for-layout-checks",
        endpoint: "https://openrouter.example.com/api/v1/very/long/endpoint/path",
        temperature: 0.4,
        maxTokens: 4096,
        timeoutMs: 30000,
        updatedAt: now - 1000
      }
    ],
    officialPresets: [
      {
        id: "official_default",
        name: "默认 Official",
        model: "gpt-4o-mini",
        temperature: 0.2,
        maxTokens: 1200,
        timeoutMs: 20000,
        updatedAt: now
      }
    ],
    defaultByokPresetId: "byok_default",
    defaultOfficialPresetId: "official_default",
    sessionOverrides: {
      conv_long_active: {
        model: "openai/gpt-4.1-mini-preview-with-extra-long-name",
        temperature: 0.6,
        maxTokens: 2048,
        timeoutMs: 25000,
        retryAttempts: 3
      }
    },
    experimentFlags: {
      showAgentSteps: true,
      autoRetryEnabled: true,
      requestTimeoutEnabled: true,
      strictValidationEnabled: true,
      fallbackSingleAgentEnabled: true,
      debugLogPanelEnabled: true,
      performanceSamplingEnabled: true
    },
    requestDefaults: {
      retryAttempts: 3
    },
    debugEvents: Array.from({ length: 18 }, (_, index) => ({
      id: `debug_${index}`,
      time: nowMinus(index),
      level: index % 4 === 0 ? "error" : "info",
      message:
        index % 3 === 0
          ? makeLongToken(`debug-event-${index}`, 8)
          : makeLongText(`第 ${index + 1} 条调试日志`, 4)
    }))
  };
}

function createBackupFile({ conversationCount = 24 } = {}) {
  const conversations = Array.from({ length: conversationCount }, (_, index) => ({
    id: `import_conv_${index}`,
    title: `导入备份中的会话 ${index}`,
    createdAt: nowMinus(900 + index),
    updatedAt: nowMinus(100 + index),
    messages: []
  }));
  const envelopeWithoutChecksum = {
    schema_version: 3,
    created_at: new Date().toISOString(),
    app_version: "0.0.1-expanded-audit",
    conversations,
    settings: makeSettingsSnapshot()
  };
  let hash = 2166136261;
  const json = JSON.stringify(envelopeWithoutChecksum);
  for (let i = 0; i < json.length; i += 1) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const checksum = (hash >>> 0).toString(16).padStart(8, "0");
  return {
    name: "this-is-a-very-long-backup-file-name-used-to-check-import-preview-layout-behavior-and-action-wrapping-geochat-backup-expanded-audit.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...envelopeWithoutChecksum, checksum }, null, 2), "utf-8")
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function prepareSeed(page) {
  const chat = makeChatSnapshot();
  const settings = makeSettingsSnapshot();
  await page.addInitScript(
    ({ chatSnapshot, settingsSnapshot }) => {
      localStorage.setItem("geohelper.chat.snapshot", JSON.stringify(chatSnapshot));
      localStorage.setItem("geohelper.settings.snapshot", JSON.stringify(settingsSnapshot));
    },
    { chatSnapshot: chat, settingsSnapshot: settings }
  );
}

async function openApp(page) {
  await prepareSeed(page);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".workspace-shell");
  await page.waitForTimeout(400);
}

async function shot(page, name) {
  const file = path.join(namedDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

async function metrics(page) {
  const raw = await page.evaluate(() => {
    const rect = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") return null;
      const r = node.getBoundingClientRect();
      if (!r.width && !r.height) return null;
      return {
        x: +r.x.toFixed(2),
        y: +r.y.toFixed(2),
        width: +r.width.toFixed(2),
        height: +r.height.toFixed(2),
        right: +r.right.toFixed(2),
        bottom: +r.bottom.toFixed(2),
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
        scrollHeight: node.scrollHeight,
        clientHeight: node.clientHeight
      };
    };

    const collectClippingAncestors = (node) => {
      const ancestors = [];
      let parent = node.parentElement;
      while (parent && parent !== document.body && parent !== document.documentElement) {
        const style = getComputedStyle(parent);
        const overflowX = style.overflowX;
        const overflowY = style.overflowY;
        const clipsX = ["auto", "scroll", "hidden", "clip"].includes(overflowX);
        const clipsY = ["auto", "scroll", "hidden", "clip"].includes(overflowY);
        if (clipsX || clipsY) {
          const r = parent.getBoundingClientRect();
          ancestors.push({
            left: +r.left.toFixed(2),
            right: +r.right.toFixed(2),
            top: +r.top.toFixed(2),
            bottom: +r.bottom.toFixed(2),
            scrollHeight: parent.scrollHeight,
            clientHeight: parent.clientHeight,
            scrollWidth: parent.scrollWidth,
            clientWidth: parent.clientWidth,
            overflowX,
            overflowY
          });
        }
        parent = parent.parentElement;
      }
      return ancestors;
    };

    const overflowingMessages = [...document.querySelectorAll(".chat-message")]
      .map((node, index) => {
        const r = node.getBoundingClientRect();
        return {
          index,
          right: +r.right.toFixed(2),
          left: +r.left.toFixed(2),
          width: +r.width.toFixed(2),
          scrollWidth: node.scrollWidth,
          clientWidth: node.clientWidth
        };
      })
      .filter((item) => item.right > innerWidth + 1 || item.scrollWidth > item.clientWidth + 1);

    const overflowingConversationTitles = [...document.querySelectorAll(".conversation-item-title")]
      .map((node, index) => ({
        index,
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
        text: (node.textContent || "").slice(0, 80)
      }))
      .filter((item) => item.scrollWidth > item.clientWidth + 1);

    const overflowingAgentSteps = [...document.querySelectorAll(".agent-step")]
      .map((node, index) => {
        const r = node.getBoundingClientRect();
        return {
          index,
          right: +r.right.toFixed(2),
          width: +r.width.toFixed(2),
          scrollWidth: node.scrollWidth,
          clientWidth: node.clientWidth
        };
      })
      .filter((item) => item.right > innerWidth + 1 || item.scrollWidth > item.clientWidth + 1);

    const overflowingDebugRows = [...document.querySelectorAll(".debug-log-panel article")]
      .map((node, index) => ({
        index,
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
        text: (node.textContent || "").slice(0, 120)
      }))
      .filter((item) => item.scrollWidth > item.clientWidth + 1);

    const overflowingImportPreview = [...document.querySelectorAll(".settings-import-preview p")]
      .map((node, index) => ({
        index,
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
        text: (node.textContent || "").slice(0, 120)
      }))
      .filter((item) => item.scrollWidth > item.clientWidth + 1);

    const buttons = [...document.querySelectorAll("button")]
      .map((button) => {
        const r = button.getBoundingClientRect();
        const s = getComputedStyle(button);
        if (s.display === "none" || s.visibility === "hidden" || (!r.width && !r.height)) return null;
        return {
          label: (button.textContent || button.getAttribute("aria-label") || "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 80),
          left: +r.left.toFixed(2),
          right: +r.right.toFixed(2),
          top: +r.top.toFixed(2),
          bottom: +r.bottom.toFixed(2),
          clippingAncestors: collectClippingAncestors(button)
        };
      })
      .filter(Boolean);

    return {
      viewport: { width: innerWidth, height: innerHeight },
      workspaceClass: document.querySelector(".workspace-shell")?.className ?? null,
      htmlOverflowX: document.documentElement.scrollWidth - innerWidth,
      htmlOverflowY: document.documentElement.scrollHeight - innerHeight,
      settingsModal: rect('[data-testid="settings-modal"]'),
      historySheet: rect('[data-testid="history-sheet"]'),
      conversationSidebar: rect('[data-testid="conversation-sidebar"]'),
      chatMessages: rect('.chat-messages'),
      debugLogPanel: rect('.debug-log-panel'),
      importPreview: rect('.settings-import-preview'),
      sessionSection: rect('.settings-section'),
      overflowingMessages,
      overflowingConversationTitles,
      overflowingAgentSteps,
      overflowingDebugRows,
      overflowingImportPreview,
      buttons
    };
  });

  const { buttons, viewport, ...rest } = raw;
  return {
    ...rest,
    viewport,
    offscreenButtons: filterViewportButtonViolations(buttons, viewport)
  };
}

async function runScenario(browser, spec) {
  const page = await browser.newPage({ viewport: spec.viewport });
  await openApp(page);
  if (spec.before) {
    await spec.before(page);
    await sleep(220);
  }
  const screenshot = await shot(page, spec.name);
  const metric = await metrics(page);
  await page.close();
  return { name: spec.name, screenshot, metrics: metric };
}

const backupFile = createBackupFile();
const scenarios = [
  {
    name: "mobile-390x844-long-chat",
    viewport: { width: 390, height: 844 },
    before: async (page) => {
      await page.getByTestId("mobile-surface-chat").click();
    }
  },
  {
    name: "land-740x360-long-chat",
    viewport: { width: 740, height: 360 },
    before: async (page) => {
      await page.getByTestId("mobile-surface-chat").click();
    }
  },
  {
    name: "desktop-1600-history-long-titles",
    viewport: { width: 1600, height: 1000 },
    before: async (page) => {
      await page.getByTestId("history-toggle-button").click();
    }
  },
  {
    name: "mobile-390x844-history-long-titles",
    viewport: { width: 390, height: 844 },
    before: async (page) => {
      await page.getByTestId("mobile-surface-chat").click();
      await page.getByTestId("history-toggle-button").click();
    }
  },
  {
    name: "mobile-390x844-settings-session",
    viewport: { width: 390, height: 844 },
    before: async (page) => {
      await page.getByRole("button", { name: "设置" }).click();
      await page.getByRole("button", { name: "当前会话", exact: true }).click();
    }
  },
  {
    name: "mobile-390x844-settings-experiments",
    viewport: { width: 390, height: 844 },
    before: async (page) => {
      await page.getByRole("button", { name: "设置" }).click();
      await page.getByRole("button", { name: "实验功能", exact: true }).click();
    }
  },
  {
    name: "mobile-390x844-settings-data-preview",
    viewport: { width: 390, height: 844 },
    before: async (page) => {
      await page.getByRole("button", { name: "设置" }).click();
      await page.getByRole("button", { name: "数据与安全", exact: true }).click();
      await page.locator('input[type="file"][accept="application/json"]').setInputFiles(backupFile);
    }
  },
  {
    name: "land-740x360-settings-data-preview",
    viewport: { width: 740, height: 360 },
    before: async (page) => {
      await page.getByRole("button", { name: "设置" }).click();
      await page.getByRole("button", { name: "数据与安全", exact: true }).click();
      await page.locator('input[type="file"][accept="application/json"]').setInputFiles(backupFile);
    }
  },
  {
    name: "mobile-390x844-settings-models",
    viewport: { width: 390, height: 844 },
    before: async (page) => {
      await page.getByRole("button", { name: "设置" }).click();
      await page.getByRole("button", { name: "模型与预设", exact: true }).click();
    }
  }
];

const browser = await chromium.launch({ headless: true });
const report = { generatedAt: new Date().toISOString(), baseUrl, scenarios: [] };
for (const scenario of scenarios) {
  report.scenarios.push(await runScenario(browser, scenario));
}
await browser.close();
fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
console.log(outDir);
