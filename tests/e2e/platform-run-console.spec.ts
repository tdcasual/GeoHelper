import { expect, test } from "@playwright/test";

const openWorkspace = async (page: import("@playwright/test").Page) => {
  await page.setViewportSize({ width: 1600, height: 960 });
  await page.goto("/");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();
};

test("platform run console renders streamed snapshot artifacts and checkpoints", async ({
  page
}) => {
  await page.route("**/api/v3/threads", async (route) => {
    await route.fulfill({
      status: 201,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*"
      },
      body: JSON.stringify({
        thread: {
          id: "thread_platform_1",
          title: "Platform Run",
          createdAt: "2026-04-04T00:00:00.000Z"
        }
      })
    });
  });

  await page.route("**/api/v3/threads/thread_platform_1/runs", async (route) => {
    await route.fulfill({
      status: 202,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*"
      },
      body: JSON.stringify({
        run: {
          id: "run_platform_1",
          threadId: "thread_platform_1",
          profileId: "platform_geometry_standard",
          status: "waiting_for_checkpoint",
          inputArtifactIds: [],
          outputArtifactIds: [],
          budget: {
            maxModelCalls: 6,
            maxToolCalls: 8,
            maxDurationMs: 120000
          },
          createdAt: "2026-04-04T00:00:00.000Z",
          updatedAt: "2026-04-04T00:00:05.000Z"
        }
      })
    });
  });

  await page.route("**/api/v3/runs/run_platform_1/stream", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "access-control-allow-origin": "*"
      },
      body: [
        "event: run.snapshot",
        `data: ${JSON.stringify({
          run: {
            id: "run_platform_1",
            threadId: "thread_platform_1",
            profileId: "platform_geometry_standard",
            status: "waiting_for_checkpoint",
            inputArtifactIds: [],
            outputArtifactIds: [],
            budget: {
              maxModelCalls: 6,
              maxToolCalls: 8,
              maxDurationMs: 120000
            },
            createdAt: "2026-04-04T00:00:00.000Z",
            updatedAt: "2026-04-04T00:00:05.000Z"
          },
          events: [
            {
              id: "event_1",
              runId: "run_platform_1",
              sequence: 1,
              type: "run.created",
              payload: {},
              createdAt: "2026-04-04T00:00:00.000Z"
            },
            {
              id: "event_2",
              runId: "run_platform_1",
              sequence: 2,
              type: "checkpoint.waiting",
              payload: {
                checkpointId: "checkpoint_1"
              },
              createdAt: "2026-04-04T00:00:05.000Z"
            }
          ],
          checkpoints: [
            {
              id: "checkpoint_1",
              runId: "run_platform_1",
              nodeId: "node_teacher_checkpoint",
              kind: "human_input",
              status: "pending",
              title: "Confirm geometry draft",
              prompt: "请确认是否继续执行。",
              createdAt: "2026-04-04T00:00:05.000Z"
            }
          ],
          artifacts: [
            {
              id: "artifact_draft_1",
              runId: "run_platform_1",
              kind: "draft",
              contentType: "application/json",
              storage: "inline",
              metadata: {},
              inlineData: {
                title: "修正版草案"
              },
              createdAt: "2026-04-04T00:00:04.000Z"
            },
            {
              id: "artifact_canvas_1",
              runId: "run_platform_1",
              kind: "canvas_evidence",
              contentType: "application/json",
              storage: "inline",
              metadata: {},
              inlineData: {
                snapshot: "scene_1"
              },
              createdAt: "2026-04-04T00:00:04.500Z"
            }
          ],
          childRuns: [
            {
              id: "run_child_platform_1",
              threadId: "thread_platform_1",
              profileId: "platform_geometry_quick_draft",
              status: "running",
              parentRunId: "run_platform_1",
              inputArtifactIds: [],
              outputArtifactIds: [],
              budget: {
                maxModelCalls: 3,
                maxToolCalls: 4,
                maxDurationMs: 60000
              },
              createdAt: "2026-04-04T00:00:03.000Z",
              updatedAt: "2026-04-04T00:00:04.000Z"
            }
          ],
          memoryEntries: []
        })}`,
        ""
      ].join("\n")
    });
  });

  await page.route(
    "**/api/v3/delegation-sessions?runId=run_platform_1",
    async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "application/json",
          "access-control-allow-origin": "*"
        },
        body: JSON.stringify({
          sessions: []
        })
      });
    }
  );

  await page.route("**/admin/runs/run_child_platform_1/timeline", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*"
      },
      body: JSON.stringify({
        run: {
          id: "run_child_platform_1",
          threadId: "thread_platform_1",
          profileId: "platform_geometry_quick_draft",
          status: "completed",
          parentRunId: "run_platform_1",
          inputArtifactIds: [],
          outputArtifactIds: ["artifact_child_response_1"],
          budget: {
            maxModelCalls: 3,
            maxToolCalls: 4,
            maxDurationMs: 60000
          },
          createdAt: "2026-04-04T00:00:03.000Z",
          updatedAt: "2026-04-04T00:00:06.000Z"
        },
        events: [
          {
            id: "event_child_1",
            runId: "run_child_platform_1",
            sequence: 1,
            type: "node.completed",
            payload: {
              nodeId: "node_finish"
            },
            createdAt: "2026-04-04T00:00:06.000Z"
          }
        ],
        childRuns: [],
        checkpoints: [],
        delegationSessions: [],
        artifacts: [
          {
            id: "artifact_child_response_1",
            runId: "run_child_platform_1",
            kind: "response",
            contentType: "application/json",
            storage: "inline",
            metadata: {},
            inlineData: {
              text: "Child run response"
            },
            createdAt: "2026-04-04T00:00:06.000Z"
          }
        ],
        summary: {
          eventCount: 1,
          checkpointCount: 0,
          pendingCheckpointCount: 0,
          delegationSessionCount: 0,
          pendingDelegationCount: 0,
          artifactCount: 1,
          memoryWriteCount: 1,
          childRunCount: 0
        },
        memoryEntries: [
          {
            id: "memory_child_1",
            scope: "thread",
            scopeId: "thread_platform_1",
            key: "review_state",
            value: {
              verdict: "ready"
            },
            sourceRunId: "run_child_platform_1",
            sourceArtifactId: "artifact_child_response_1",
            createdAt: "2026-04-04T00:00:06.000Z"
          }
        ]
      })
    });
  });

  await openWorkspace(page);
  await page.getByPlaceholder("例如：过点A和B作垂直平分线").fill("画一个圆");
  await page.getByRole("button", { name: "发送" }).click();

  const historyToggle = page.getByTestId("history-toggle-button");
  const dialogRail = page.getByTestId("workspace-dialog-rail");
  const dialogRailBoxBeforeToggle = await dialogRail.boundingBox();

  await expect(page.getByTestId("run-console")).toBeVisible();
  await expect(page.getByTestId("run-console")).toContainText("run_platform_1");
  await expect(page.getByTestId("run-console")).toContainText(
    "platform_geometry_standard"
  );
  await expect(page.getByTestId("run-console")).toContainText("waiting_for_checkpoint");
  await expect(page.getByTestId("run-console")).toContainText("Subagents");
  await expect(page.getByTestId("run-console")).toContainText("run_child_platform_1");
  await expect(page.getByTestId("run-console")).toContainText(
    "platform_geometry_quick_draft"
  );
  await expect(page.getByTestId("run-console")).toContainText("checkpoint.waiting");
  await page.getByRole("button", { name: "Inspect run" }).click();
  await expect(page.getByTestId("admin-run-inspector")).toBeVisible();
  await expect(page.getByTestId("admin-run-inspector")).toContainText("event count");
  await expect(page.getByTestId("admin-run-inspector")).toContainText("artifact count");
  await page.locator('[data-run-id="run_child_platform_1"]').first().click();
  await expect(page.getByTestId("admin-run-inspector")).toContainText(
    "artifact_child_response_1"
  );
  await expect(page.getByTestId("admin-run-inspector")).toContainText("review_state");

  await expect(page.getByTestId("checkpoint-inbox")).toContainText(
    "Confirm geometry draft"
  );
  await expect(page.getByTestId("artifact-viewer")).toContainText("修正版草案");
  await expect(page.getByTestId("artifact-viewer")).toContainText("scene_1");

  await historyToggle.click();
  await expect(page.getByTestId("conversation-sidebar")).toBeVisible();
  await expect(page.getByTestId("run-console")).toBeVisible();
  await expect(page.getByTestId("admin-run-inspector")).toBeVisible();

  const dialogRailBoxAfterToggle = await dialogRail.boundingBox();
  expect(dialogRailBoxBeforeToggle).not.toBeNull();
  expect(dialogRailBoxAfterToggle).not.toBeNull();

  if (!dialogRailBoxBeforeToggle || !dialogRailBoxAfterToggle) {
    return;
  }

  expect(
    Math.abs(dialogRailBoxAfterToggle.width - dialogRailBoxBeforeToggle.width)
  ).toBeLessThanOrEqual(4);
});
