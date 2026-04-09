import { describe, expect, it, vi } from "vitest";

import { getPlatformRunProfile } from "../runtime/platform-run-profiles";
import { createRuntimeRunResponseFixture } from "../test-utils/platform-run-fixture";
import type { ChatStoreDeps, ChatStoreState } from "./chat-store";
import { createChatStoreActions } from "./chat-store-actions";
import type { PersistableChatState } from "./chat-store-helpers";

const createBaseState = (): ChatStoreState => ({
  mode: "byok",
  sessionToken: null,
  conversations: [],
  activeConversationId: null,
  messages: [],
  isSending: false,
  reauthRequired: false,
  setMode: () => undefined,
  setSessionToken: () => undefined,
  createConversation: () => "",
  selectConversation: () => undefined,
  acknowledgeReauth: () => undefined,
  send: async () => undefined,
  sendFollowUpPrompt: async () => undefined,
  updateUncertaintyReviewStatus: () => undefined
});

const createDeps = (): ChatStoreDeps => ({
  submitPrompt: vi.fn(),
  resolveRunOptions: vi.fn(),
  logEvent: vi.fn(),
  recordRunSnapshot: vi.fn()
});

const createActionHarness = (
  stateOverride: Partial<ChatStoreState> = {},
  depsOverride: Partial<ChatStoreDeps> = {}
) => {
  let state: ChatStoreState = {
    ...createBaseState(),
    ...stateOverride
  };
  const saveState = vi.fn<(snapshot: PersistableChatState) => void>();
  const set = (
    partial:
      | Partial<ChatStoreState>
      | ((state: ChatStoreState) => Partial<ChatStoreState>)
  ) => {
    const next = typeof partial === "function" ? partial(state) : partial;
    state = {
      ...state,
      ...next
    };
  };
  const get = () => state;
  const actions = createChatStoreActions({
    set,
    get,
    saveState,
    deps: {
      ...createDeps(),
      ...depsOverride
    }
  });

  return {
    actions,
    getState: () => state,
    saveState
  };
};

describe("chat-store actions", () => {
  it("creates a new conversation and initializes an empty message list", () => {
    const harness = createActionHarness();

    const conversationId = harness.actions.createConversation();

    expect(harness.getState().activeConversationId).toBe(conversationId);
    expect(harness.getState().messages).toEqual([]);
    expect(harness.getState().conversations[0]?.id).toBe(conversationId);
    expect(harness.saveState).toHaveBeenCalledWith(
      expect.objectContaining({
        activeConversationId: conversationId,
        messages: []
      })
    );
  });

  it("appends structured run results when send succeeds", async () => {
    const harness = createActionHarness(
      {},
      {
        resolveRunOptions: vi.fn(async () => ({
          runtimeTarget: "direct" as const,
          runtimeCapabilities: {
            supportsOfficialAuth: false,
            supportsVision: true,
            supportsAgentSteps: false,
            supportsServerMetrics: false,
            supportsRateLimitHeaders: false
          },
          platformRunProfile: getPlatformRunProfile(),
          retryAttempts: 0,
          extraHeaders: {}
        })),
        submitPrompt: vi.fn(async () => ({
          ...createRuntimeRunResponseFixture({
            run: {
              id: "run_send"
            },
            checkpoints: [
              {
                id: "unc_d",
                runId: "run_send",
                nodeId: "node_teacher_checkpoint",
                kind: "human_input",
                status: "pending",
                title: "点 D 在线段 BC 上",
                prompt: "请确认点 D 是否在线段 BC 上。",
                createdAt: "2026-04-04T00:00:02.000Z"
              }
            ],
            artifacts: [
              {
                id: "artifact_response_send",
                runId: "run_send",
                kind: "response",
                contentType: "application/json",
                storage: "inline",
                metadata: {},
                inlineData: {
                  summary: ["已创建三角形 ABC"]
                },
                createdAt: "2026-04-04T00:00:03.000Z"
              }
            ]
          })
        })),
      }
    );

    await harness.actions.send("画一个三角形");

    const assistantMessage =
      [...harness.getState().messages]
        .reverse()
        .find((message) => message.role === "assistant") ?? undefined;

    expect(assistantMessage?.result).toMatchObject({
      status: "success",
      summaryItems: ["已创建三角形 ABC"]
    });
    expect(assistantMessage?.platformRunId).toBe("run_send");
    expect(assistantMessage?.result?.uncertaintyItems[0]?.label).toBe(
      "点 D 在线段 BC 上"
    );
    expect(harness.saveState).toHaveBeenCalled();
  });

  it("records delegation sessions together with the run snapshot", async () => {
    const recordRunSnapshot = vi.fn();
    const harness = createActionHarness(
      {},
      {
        resolveRunOptions: vi.fn(async () => ({
          runtimeTarget: "direct" as const,
          runtimeCapabilities: {
            supportsOfficialAuth: false,
            supportsVision: true,
            supportsAgentSteps: false,
            supportsServerMetrics: false,
            supportsRateLimitHeaders: false
          },
          platformRunProfile: getPlatformRunProfile(),
          retryAttempts: 0,
          extraHeaders: {}
        })),
        submitPrompt: vi.fn(async () =>
          createRuntimeRunResponseFixture({
            run: {
              id: "run_acp_surface"
            },
            delegationSessions: [
              {
                id: "delegation_session_run_acp_surface_node_delegate",
                runId: "run_acp_surface",
                checkpointId: "checkpoint_1",
                delegationName: "teacher_review",
                agentRef: "openclaw.geometry-reviewer",
                status: "pending",
                outputArtifactIds: [],
                createdAt: "2026-04-08T00:00:00.000Z",
                updatedAt: "2026-04-08T00:00:00.000Z"
              }
            ]
          })
        ),
        recordRunSnapshot
      }
    );

    await harness.actions.send("继续");

    expect(recordRunSnapshot).toHaveBeenCalledWith({
      messageId: expect.any(String),
      snapshot: expect.objectContaining({
        run: expect.objectContaining({
          id: "run_acp_surface"
        })
      }),
      delegationSessions: [
        expect.objectContaining({
          id: "delegation_session_run_acp_surface_node_delegate",
          status: "pending"
        })
      ]
    });
  });

  it("updates one uncertainty review status without changing unrelated items", () => {
    const harness = createActionHarness({
      activeConversationId: "conv_review",
      conversations: [
        {
          id: "conv_review",
          title: "Triangle",
          createdAt: 1,
          updatedAt: 2,
          messages: [
            {
              id: "msg_assistant_review",
              role: "assistant",
              content: "已创建三角形 ABC",
              result: {
                status: "success",
                commandCount: 1,
                summaryItems: ["已创建三角形 ABC"],
                explanationLines: [],
                warningItems: [],
                uncertaintyItems: [
                  {
                    id: "unc_d",
                    label: "点 D 在线段 BC 上",
                    reviewStatus: "pending",
                    followUpPrompt: "请确认点 D 是否在线段 BC 上。"
                  },
                  {
                    id: "unc_angle",
                    label: "AD 是否平分角 A",
                    reviewStatus: "pending",
                    followUpPrompt: "请确认 AD 是否平分角 A。"
                  }
                ],
                canvasLinks: []
              }
            }
          ]
        }
      ],
      messages: [
        {
          id: "msg_assistant_review",
          role: "assistant",
          content: "已创建三角形 ABC",
          result: {
            status: "success",
            commandCount: 1,
            summaryItems: ["已创建三角形 ABC"],
            explanationLines: [],
            warningItems: [],
            uncertaintyItems: [
              {
                id: "unc_d",
                label: "点 D 在线段 BC 上",
                reviewStatus: "pending",
                followUpPrompt: "请确认点 D 是否在线段 BC 上。"
              },
              {
                id: "unc_angle",
                label: "AD 是否平分角 A",
                reviewStatus: "pending",
                followUpPrompt: "请确认 AD 是否平分角 A。"
              }
            ],
            canvasLinks: []
          }
        }
      ]
    });

    harness.actions.updateUncertaintyReviewStatus({
      messageId: "msg_assistant_review",
      uncertaintyId: "unc_d",
      reviewStatus: "confirmed"
    });

    const result = harness.getState().messages[0]?.result;
    expect(result?.uncertaintyItems[0]?.reviewStatus).toBe("confirmed");
    expect(result?.uncertaintyItems[1]?.reviewStatus).toBe("pending");
    expect(harness.saveState).toHaveBeenCalled();
  });
});
