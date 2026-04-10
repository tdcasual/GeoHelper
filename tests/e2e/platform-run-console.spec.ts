import { expect, test } from "@playwright/test";

const openWorkspace = async (page: import("@playwright/test").Page) => {
  await page.setViewportSize({ width: 1600, height: 960 });
  await page.goto("/");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();
};

const buildEventStreamBody = (payload: unknown): string =>
  ["event: run.snapshot", `data: ${JSON.stringify(payload)}`, ""].join("\n");

test("platform run console renders streamed snapshot artifacts and checkpoints", async ({
  page
}) => {
  const rootArtifacts = [
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
  ];
  const childArtifacts = [
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
  ];
  const childMemoryEntries = [
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
  ];

  let rootRunStatus: "waiting_for_checkpoint" | "running" | "cancelled" =
    "waiting_for_checkpoint";
  let rootRunUpdatedAt = "2026-04-04T00:00:05.000Z";
  let checkpointStatus: "pending" | "resolved" | "cancelled" = "pending";
  let checkpointResolvedAt: string | null = null;
  let rootEventSequence = 2;
  const rootEvents: Array<{
    id: string;
    runId: string;
    sequence: number;
    type: string;
    payload: Record<string, unknown>;
    createdAt: string;
  }> = [
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
  ];
  let childClaimReleased = false;

  const buildRootRun = () => ({
    id: "run_platform_1",
    threadId: "thread_platform_1",
    profileId: "platform_geometry_standard",
    status: rootRunStatus,
    inputArtifactIds: [],
    outputArtifactIds: [],
    budget: {
      maxModelCalls: 6,
      maxToolCalls: 8,
      maxDurationMs: 120000
    },
    createdAt: "2026-04-04T00:00:00.000Z",
    updatedAt: rootRunUpdatedAt
  });

  const buildChildRun = () => ({
    id: "run_child_platform_1",
    threadId: "thread_platform_1",
    profileId: "platform_geometry_quick_draft",
    status: "waiting_for_subagent" as const,
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
  });

  const buildCheckpoint = () => {
    if (checkpointStatus === "pending") {
      return {
        id: "checkpoint_1",
        runId: "run_platform_1",
        nodeId: "node_teacher_checkpoint",
        kind: "human_input" as const,
        status: "pending" as const,
        title: "Confirm geometry draft",
        prompt: "请确认是否继续执行。",
        createdAt: "2026-04-04T00:00:05.000Z"
      };
    }

    return {
      id: "checkpoint_1",
      runId: "run_platform_1",
      nodeId: "node_teacher_checkpoint",
      kind: "human_input" as const,
      status: checkpointStatus,
      title: "Confirm geometry draft",
      prompt: "请确认是否继续执行。",
      response: {
        approved: true
      },
      createdAt: "2026-04-04T00:00:05.000Z",
      resolvedAt: checkpointResolvedAt ?? "2026-04-04T00:00:06.000Z"
    };
  };

  const buildRootSnapshot = () => ({
    run: buildRootRun(),
    events: rootEvents,
    checkpoints: [buildCheckpoint()],
    artifacts: rootArtifacts,
    childRuns: [buildChildRun()],
    memoryEntries: []
  });

  const buildRootTimeline = () => {
    const checkpoints = [buildCheckpoint()];
    const pendingCheckpointCount = checkpoints.filter(
      (checkpoint) => checkpoint.status === "pending"
    ).length;

    return {
      run: buildRootRun(),
      events: rootEvents,
      childRuns: [buildChildRun()],
      checkpoints,
      delegationSessions: [],
      artifacts: rootArtifacts,
      summary: {
        eventCount: rootEvents.length,
        checkpointCount: checkpoints.length,
        pendingCheckpointCount,
        delegationSessionCount: 0,
        pendingDelegationCount: 0,
        artifactCount: rootArtifacts.length,
        memoryWriteCount: 0,
        childRunCount: 1
      },
      memoryEntries: []
    };
  };

  const buildChildDelegationSession = () => ({
    id: "delegation_session_run_child_platform_1_node_delegate",
    runId: "run_child_platform_1",
    checkpointId: "checkpoint_child_1",
    delegationName: "teacher_review",
    agentRef: "openclaw.geometry-reviewer",
    status: "pending" as const,
    claimedBy: childClaimReleased ? null : "executor_geometry_reviewer",
    claimedAt: childClaimReleased ? null : "2026-04-04T00:05:00.000Z",
    claimExpiresAt: childClaimReleased ? null : "2026-04-04T00:10:00.000Z",
    outputArtifactIds: [],
    createdAt: "2026-04-04T00:00:20.000Z",
    updatedAt: childClaimReleased
      ? "2026-04-04T00:07:30.000Z"
      : "2026-04-04T00:00:20.000Z"
  });

  const buildChildTimeline = () => {
    const delegationSessions = [buildChildDelegationSession()];

    return {
      run: buildChildRun(),
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
      delegationSessions,
      artifacts: childArtifacts,
      summary: {
        eventCount: 1,
        checkpointCount: 0,
        pendingCheckpointCount: 0,
        delegationSessionCount: delegationSessions.length,
        pendingDelegationCount: delegationSessions.filter(
          (session) => session.status === "pending"
        ).length,
        artifactCount: childArtifacts.length,
        memoryWriteCount: childMemoryEntries.length,
        childRunCount: 0
      },
      memoryEntries: childMemoryEntries
    };
  };

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
        run: buildRootRun()
      })
    });
  });

  await page.route("**/api/v3/runs/run_platform_1/stream*", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "access-control-allow-origin": "*"
      },
      body: buildEventStreamBody(buildRootSnapshot())
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

  await page.route("**/admin/runs/run_platform_1/timeline", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*"
      },
      body: JSON.stringify(buildRootTimeline())
    });
  });

  await page.route("**/admin/runs/run_child_platform_1/timeline", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*"
      },
      body: JSON.stringify(buildChildTimeline())
    });
  });

  await page.route("**/api/v3/checkpoints/checkpoint_1/resolve", async (route) => {
    checkpointStatus = "resolved";
    checkpointResolvedAt = "2026-04-04T00:00:06.000Z";
    rootRunStatus = "running";
    rootRunUpdatedAt = "2026-04-04T00:00:06.000Z";
    rootEventSequence += 1;
    rootEvents.push({
      id: `event_${rootEventSequence}`,
      runId: "run_platform_1",
      sequence: rootEventSequence,
      type: "checkpoint.resolved",
      payload: {
        checkpointId: "checkpoint_1",
        response: {
          approved: true
        }
      },
      createdAt: "2026-04-04T00:00:06.000Z"
    });

    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*"
      },
      body: JSON.stringify({
        checkpoint: buildCheckpoint()
      })
    });
  });

  await page.route("**/api/v3/runs/run_platform_1/cancel", async (route) => {
    rootRunStatus = "cancelled";
    rootRunUpdatedAt = "2026-04-04T00:00:07.000Z";
    rootEventSequence += 1;
    rootEvents.push({
      id: `event_${rootEventSequence}`,
      runId: "run_platform_1",
      sequence: rootEventSequence,
      type: "run.cancelled",
      payload: {
        previousStatus: "running"
      },
      createdAt: "2026-04-04T00:00:07.000Z"
    });

    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*"
      },
      body: JSON.stringify({
        run: buildRootRun()
      })
    });
  });

  await page.route(
    "**/admin/delegation-sessions/delegation_session_run_child_platform_1_node_delegate/release",
    async (route) => {
      childClaimReleased = true;

      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "application/json",
          "access-control-allow-origin": "*"
        },
        body: JSON.stringify({
          session: buildChildDelegationSession()
        })
      });
    }
  );

  await openWorkspace(page);
  await page
    .getByPlaceholder("例如：过点A和B作垂直平分线")
    .fill("画一个圆");
  await page.getByRole("button", { name: "发送" }).click();

  const historyToggle = page.getByTestId("history-toggle-button");
  const dialogRail = page.getByTestId("workspace-dialog-rail");

  await expect(page.getByTestId("run-console")).toBeVisible();
  await expect(page.getByTestId("run-console")).toContainText("run_platform_1");
  await expect(page.getByTestId("run-console")).toContainText(
    "platform_geometry_standard"
  );
  await expect(page.getByTestId("run-console")).toContainText(
    "waiting_for_checkpoint"
  );
  await expect(page.getByTestId("run-console")).toContainText("Subagents");
  await expect(page.getByTestId("run-console")).toContainText(
    "run_child_platform_1"
  );
  await expect(page.getByTestId("run-console")).toContainText(
    "platform_geometry_quick_draft"
  );
  await expect(page.getByTestId("run-console")).toContainText(
    "checkpoint.waiting"
  );
  await expect(page.getByTestId("checkpoint-inbox")).toContainText(
    "Confirm geometry draft"
  );
  await expect(page.getByTestId("checkpoint-inbox")).toContainText(
    "Approve checkpoint"
  );
  await expect(page.getByTestId("run-console")).toContainText("Cancel run");
  await expect(page.getByTestId("artifact-viewer")).toContainText("修正版草案");
  await expect(page.getByTestId("artifact-viewer")).toContainText("scene_1");

  await page.getByRole("button", { name: "Inspect run" }).click();
  await expect(page.getByTestId("admin-run-inspector")).toBeVisible();
  await expect(page.getByTestId("admin-run-inspector")).toContainText(
    "event count"
  );
  await expect(page.getByTestId("admin-run-inspector")).toContainText(
    "artifact count"
  );
  await page.locator('[data-run-id="run_child_platform_1"]').first().click();
  await expect(page.getByTestId("admin-run-inspector")).toContainText(
    "artifact_child_response_1"
  );
  await expect(page.getByTestId("admin-run-inspector")).toContainText(
    "review_state"
  );
  await expect(page.getByTestId("admin-run-inspector")).toContainText(
    "executor_geometry_reviewer"
  );
  await expect(page.getByTestId("admin-run-inspector")).toContainText(
    "Force release claim"
  );

  await page.getByRole("button", { name: "Approve checkpoint" }).click();
  await expect(page.getByTestId("checkpoint-inbox")).not.toContainText(
    "Confirm geometry draft"
  );

  await page.getByRole("button", { name: "Cancel run" }).click();
  await expect(page.getByTestId("run-console")).toContainText("cancelled");

  await page.getByRole("button", { name: "Force release claim" }).click();
  await expect(page.getByTestId("admin-run-inspector")).not.toContainText(
    "executor_geometry_reviewer"
  );
  await expect(page.getByTestId("admin-run-inspector")).not.toContainText(
    "2026-04-04T00:10:00.000Z"
  );

  const dialogRailBoxBeforeToggle = await dialogRail.boundingBox();

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
