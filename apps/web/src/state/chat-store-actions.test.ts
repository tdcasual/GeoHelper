import { describe, expect, it, vi } from "vitest";

import { createAgentRunEnvelopeFixture } from "../test-utils/agent-run-fixture";
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
  compile: vi.fn(),
  execute: vi.fn(),
  resolveCompileOptions: vi.fn(),
  logEvent: vi.fn(),
  recordAgentRun: vi.fn()
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

  it("appends structured compile results when send succeeds", async () => {
    const harness = createActionHarness(
      {},
      {
        resolveCompileOptions: vi.fn(async () => ({
          runtimeTarget: "direct" as const,
          runtimeCapabilities: {
            supportsOfficialAuth: false,
            supportsVision: true,
            supportsAgentSteps: false,
            supportsServerMetrics: false,
            supportsRateLimitHeaders: false
          },
          retryAttempts: 0,
          extraHeaders: {}
        })),
        compile: vi.fn(async () => ({
          trace_id: "trace_send",
          agent_run: createAgentRunEnvelopeFixture({
            run: {
              id: "run_send"
            },
            draft: {
              commandBatchDraft: {
                version: "1.0",
                scene_id: "scene_send",
                transaction_id: "tx_send",
                commands: [],
                post_checks: ["待确认：点 D 在线段 BC 上"],
                explanations: ["已创建三角形 ABC"]
              }
            },
            teacherPacket: {
              summary: ["已创建三角形 ABC"],
              warnings: [],
              uncertainties: [
                {
                  id: "unc_d",
                  label: "点 D 在线段 BC 上",
                  reviewStatus: "pending",
                  followUpPrompt: "请确认点 D 是否在线段 BC 上。"
                }
              ],
              canvasLinks: [],
              nextActions: ["执行到画布"]
            },
            telemetry: {
              upstreamCallCount: 2,
              degraded: false,
              retryCount: 0,
              stages: []
            }
          })
        })),
        execute: vi.fn(async () => undefined)
      }
    );

    await harness.actions.send("画一个三角形");

    const assistantMessage =
      [...harness.getState().messages]
        .reverse()
        .find((message) => message.role === "assistant") ?? undefined;

    expect(assistantMessage?.result).toMatchObject({
      status: "success",
      commandCount: 0,
      summaryItems: ["已创建三角形 ABC"]
    });
    expect(assistantMessage?.agentRunId).toBe("run_send");
    expect(assistantMessage?.result?.uncertaintyItems[0]?.label).toBe(
      "点 D 在线段 BC 上"
    );
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
