import { afterEach, describe, expect, it, vi } from "vitest";

import { threadStore } from "../state/thread-store";
import { createRunSnapshotFixture } from "../test-utils/platform-run-fixture";
import { getPlatformRunProfile } from "./platform-run-profiles";
import { submitPromptToPlatform } from "./platform-runner";

const createJsonResponse = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });

const createSseSnapshotResponse = (): Response =>
  new Response(
    `event: run.snapshot\ndata: ${JSON.stringify(createRunSnapshotFixture())}\n\n`,
    {
      status: 200,
      headers: {
        "content-type": "text/event-stream"
      }
    }
  );

describe("platform-runner", () => {
  afterEach(() => {
    threadStore.getState().clear();
    vi.unstubAllGlobals();
  });

  it("starts runs with agent, workflow, and budget from the selected run profile", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        createJsonResponse({
          thread: {
            id: "thread_1",
            title: "快速草稿",
            createdAt: "2026-04-04T00:00:00.000Z"
          }
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse(
          {
            run: createRunSnapshotFixture({
              run: {
                id: "run_1",
                threadId: "thread_1"
              }
            }).run
          },
          202
        )
      )
      .mockResolvedValueOnce(createSseSnapshotResponse())
      .mockResolvedValueOnce(
        createJsonResponse({
          sessions: []
        })
      );

    vi.stubGlobal("fetch", fetchMock);

    const result = await submitPromptToPlatform({
      conversationId: "conv_1",
      message: "快速草稿",
      mode: "byok",
      platformRunProfile: getPlatformRunProfile("platform_geometry_quick_draft")
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const startRunRequest = fetchMock.mock.calls[1];
    expect(startRunRequest?.[0]).toContain("/api/v3/threads/thread_1/runs");
    expect(JSON.parse(String(startRunRequest?.[1]?.body))).toEqual({
      profileId: "platform_geometry_quick_draft",
      inputArtifactIds: [],
    });
    expect(fetchMock.mock.calls[3]?.[0]).toContain(
      "/api/v3/acp-sessions?runId=run_1"
    );
    expect(result.acpSessions).toEqual([]);
  });
});
