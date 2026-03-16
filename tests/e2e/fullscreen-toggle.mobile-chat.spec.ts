import { expect, test } from "@playwright/test";

import {
  openCompactChatWorkspace,
  seedChatSnapshot
} from "./fullscreen-toggle.test-helpers";

test("short landscape chat preserves message room above the composer", async ({
  page
}) => {
  await openCompactChatWorkspace(page, { width: 844, height: 390 });

  const { messagesHeight, composerHeight } = await page.evaluate(() => ({
    messagesHeight:
      document.querySelector(".chat-messages")?.getBoundingClientRect().height ?? 0,
    composerHeight:
      document.querySelector(".chat-composer")?.getBoundingClientRect().height ?? 0
  }));

  expect(messagesHeight).toBeGreaterThanOrEqual(100);
  expect(composerHeight).toBeLessThanOrEqual(150);
});

test("mobile overflow menu closes on outside click", async ({ page }) => {
  await openCompactChatWorkspace(page, { width: 390, height: 844 });

  await page.getByTestId("mobile-more-button").click();
  await expect(page.getByTestId("mobile-overflow-menu")).toBeVisible();

  await page.mouse.click(40, 220);
  await expect(page.getByTestId("mobile-overflow-menu")).toBeHidden();
});

test("mobile plus menu closes when leaving the chat surface", async ({ page }) => {
  await openCompactChatWorkspace(page, { width: 390, height: 844 });

  await page.getByTestId("plus-menu-button").click();
  await expect(page.getByTestId("plus-menu")).toBeVisible();

  await page.getByTestId("mobile-surface-canvas").click();
  await page.getByTestId("mobile-surface-chat").click();
  await expect(page.getByTestId("plus-menu")).toBeHidden();
});

test("compact empty state keeps template shortcuts available", async ({ page }) => {
  await openCompactChatWorkspace(page, { width: 390, height: 844 });

  await expect(page.getByTestId("chat-empty-template-button")).toHaveCount(2);

  await page.getByTestId("chat-empty-template-button").first().click();
  await expect(page.getByTestId("chat-composer-input")).not.toHaveValue("");
});

test("compact portrait empty state stays vertically centered in chat surface", async ({
  page
}) => {
  await openCompactChatWorkspace(page, { width: 390, height: 844 });
  await expect(page.getByTestId("chat-empty-compact")).toBeVisible();

  const { emptyCenter, messagesCenter } = await page.evaluate(() => {
    const emptyRect = document
      .querySelector("[data-testid='chat-empty-compact']")
      ?.getBoundingClientRect();
    const messagesRect = document.querySelector(".chat-messages")?.getBoundingClientRect();
    return {
      emptyCenter: emptyRect ? emptyRect.y + emptyRect.height / 2 : 0,
      messagesCenter: messagesRect ? messagesRect.y + messagesRect.height / 2 : 0
    };
  });

  expect(Math.abs(messagesCenter - emptyCenter)).toBeLessThanOrEqual(80);
});

test("short landscape compact empty state stays visually centered", async ({
  page
}) => {
  await openCompactChatWorkspace(page, { width: 844, height: 390 });
  await expect(page.getByTestId("chat-empty-compact")).toBeVisible();

  const { viewportCenter, emptyCenter } = await page.evaluate(() => {
    const rect = document
      .querySelector("[data-testid='chat-empty-compact']")
      ?.getBoundingClientRect();
    return {
      viewportCenter: window.innerWidth / 2,
      emptyCenter: rect ? rect.x + rect.width / 2 : 0
    };
  });

  expect(Math.abs(viewportCenter - emptyCenter)).toBeLessThanOrEqual(80);
});

test("short landscape plus menu keeps message area usable", async ({ page }) => {
  await openCompactChatWorkspace(page, { width: 844, height: 390 });

  await page.getByTestId("plus-menu-button").click();
  await expect(page.getByTestId("plus-menu")).toBeVisible();

  const { messagesHeight, composerBottom, viewportHeight } = await page.evaluate(() => ({
    messagesHeight:
      document.querySelector(".chat-messages")?.getBoundingClientRect().height ?? 0,
    composerBottom:
      document.querySelector(".chat-composer")?.getBoundingClientRect().bottom ?? 0,
    viewportHeight: window.innerHeight
  }));

  expect(messagesHeight).toBeGreaterThanOrEqual(80);
  expect(composerBottom).toBeLessThanOrEqual(viewportHeight);
});

test("short landscape slash menu stays within viewport and preserves messages", async ({
  page
}) => {
  await openCompactChatWorkspace(page, { width: 844, height: 390 });
  await page.getByTestId("chat-composer-input").fill("/");
  await expect(page.getByTestId("slash-command-menu")).toBeVisible();

  const { messagesHeight, composerBottom, viewportHeight, slashHeight } = await page.evaluate(() => ({
    messagesHeight:
      document.querySelector(".chat-messages")?.getBoundingClientRect().height ?? 0,
    composerBottom:
      document.querySelector(".chat-composer")?.getBoundingClientRect().bottom ?? 0,
    viewportHeight: window.innerHeight,
    slashHeight:
      document.querySelector("[data-testid='slash-command-menu']")?.getBoundingClientRect()
        .height ?? 0
  }));

  expect(messagesHeight).toBeGreaterThanOrEqual(56);
  expect(composerBottom).toBeLessThanOrEqual(viewportHeight);
  expect(slashHeight).toBeLessThanOrEqual(96);
});

test("long assistant token wraps inside compact mobile chat bubble", async ({
  page
}) => {
  const longAssistantToken = `GeoGebra_${"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".repeat(180)}`;

  await seedChatSnapshot(page, {
    mode: "byok",
    sessionToken: null,
    activeConversationId: "conv_long_token",
    reauthRequired: false,
    messages: [
      {
        id: "assistant_long_token",
        role: "assistant",
        content: longAssistantToken
      }
    ],
    conversations: [
      {
        id: "conv_long_token",
        title: "long token",
        createdAt: 1,
        updatedAt: 1,
        messages: [
          {
            id: "assistant_long_token",
            role: "assistant",
            content: longAssistantToken
          }
        ]
      }
    ]
  });

  await openCompactChatWorkspace(page, { width: 390, height: 844 });
  await expect(page.locator(".chat-message-assistant")).toBeVisible();

  const metrics = await page.evaluate(() => {
    const bubble = document.querySelector(".chat-message-assistant") as HTMLElement | null;
    const body = bubble?.querySelector("div") as HTMLElement | null;
    return {
      bubbleScrollWidth: bubble?.scrollWidth ?? 0,
      bubbleClientWidth: bubble?.clientWidth ?? 0,
      bodyScrollWidth: body?.scrollWidth ?? 0,
      bodyClientWidth: body?.clientWidth ?? 0,
      documentScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth
    };
  });

  expect(metrics.bubbleScrollWidth).toBeLessThanOrEqual(metrics.bubbleClientWidth + 1);
  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.bodyClientWidth + 1);
  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
});

test("short landscape long chat keeps composer compact and message viewport readable", async ({
  page
}) => {
  const makeLongText = (label: string, repeat = 12) =>
    `${label} ${Array.from({ length: repeat }, (_, index) => `第${index + 1}段内容用于测试滚动与换行表现`).join("，")}`;
  const makeLongToken = (prefix: string, repeat = 18) =>
    `${prefix}_${"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".repeat(repeat)}`;

  const assistantMessage = {
    id: "assistant_long_chat",
    role: "assistant",
    content:
      makeLongText("已为你生成草图，同时补充一段超长不可断行 token 用于测试", 10) +
      "\n" +
      makeLongToken("UNBROKEN", 18),
    traceId: "trace-long-chat",
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
  };

  await seedChatSnapshot(page, {
    mode: "byok",
    sessionToken: null,
    activeConversationId: "conv_long_landscape",
    reauthRequired: false,
    messages: [
      {
        id: "user_long_chat",
        role: "user",
        content: makeLongText("请根据如下条件绘制几何对象，并给出逐步解释", 12)
      },
      assistantMessage
    ],
    conversations: [
      {
        id: "conv_long_landscape",
        title: "long chat",
        createdAt: 1,
        updatedAt: 1,
        messages: [
          {
            id: "user_long_chat",
            role: "user",
            content: makeLongText("请根据如下条件绘制几何对象，并给出逐步解释", 12)
          },
          assistantMessage
        ]
      }
    ]
  });

  await openCompactChatWorkspace(page, { width: 740, height: 360 });
  await expect(page.locator(".chat-message-assistant")).toBeVisible();

  const metrics = await page.evaluate(() => {
    const messages = document.querySelector(".chat-messages") as HTMLElement | null;
    const composer = document.querySelector(".chat-composer") as HTMLElement | null;
    const shell = document.querySelector("[data-testid='chat-composer-shell']") as HTMLElement | null;
    const submit = shell?.querySelector("button[type='submit']") as HTMLElement | null;
    return {
      messagesHeight: messages?.getBoundingClientRect().height ?? 0,
      composerHeight: composer?.getBoundingClientRect().height ?? 0,
      shellHeight: shell?.getBoundingClientRect().height ?? 0,
      shellWidth: shell?.getBoundingClientRect().width ?? 0,
      submitWidth: submit?.getBoundingClientRect().width ?? 0
    };
  });

  expect(metrics.messagesHeight).toBeGreaterThanOrEqual(120);
  expect(metrics.composerHeight).toBeLessThanOrEqual(80);
  expect(metrics.shellHeight).toBeLessThanOrEqual(80);
  expect(metrics.submitWidth).toBeLessThanOrEqual(metrics.shellWidth / 2);
});
