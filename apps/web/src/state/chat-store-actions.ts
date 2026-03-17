import type { CommandBatch } from "@geohelper/protocol";

import type { RuntimeCompileResponse } from "../runtime/types";
import {
  buildAssistantMessageFromCompileResult,
  buildAssistantMessageFromError,
  buildAssistantMessageFromGuard,
  buildCompileContext,
  isOfficialSessionExpiredError,
  resolveChatSendGuard
} from "./chat-send-flow";
import type {
  ChatMessage,
  ChatSendInput,
  ChatStoreDeps,
  ChatStoreState
} from "./chat-store";
import {
  buildStateWithAssistantMessage,
  buildStateWithUserMessage,
  createConversationThread,
  getMessagesForConversation,
  makeId,
  normalizeSendInput,
  type PersistableChatState
} from "./chat-store-helpers";
import type { ChatStudioUncertaintyReviewStatus } from "./chat-result";
import { sceneStore } from "./scene-store";
import { settingsStore } from "./settings-store";

type ChatStoreSetter = (
  partial:
    | Partial<ChatStoreState>
    | ((state: ChatStoreState) => Partial<ChatStoreState>)
) => void;

interface CreateChatStoreActionsInput {
  set: ChatStoreSetter;
  get: () => ChatStoreState;
  saveState: (state: PersistableChatState) => void;
  deps: ChatStoreDeps;
}

export const createChatStoreActions = ({
  set,
  get,
  saveState,
  deps
}: CreateChatStoreActionsInput) => ({
  createConversation: () => {
    const conversation = createConversationThread();
    set((state) => {
      const conversations = [conversation, ...state.conversations];
      const activeConversationId = conversation.id;
      const messages = conversation.messages;
      saveState({
        mode: state.mode,
        sessionToken: state.sessionToken,
        conversations,
        activeConversationId,
        messages,
        reauthRequired: state.reauthRequired
      });
      return {
        conversations,
        activeConversationId,
        messages
      };
    });

    return conversation.id;
  },
  selectConversation: (conversationId: string) =>
    set((state) => {
      const exists = state.conversations.some((item) => item.id === conversationId);
      if (!exists) {
        return {};
      }

      const messages = getMessagesForConversation(
        state.conversations,
        conversationId
      );
      saveState({
        mode: state.mode,
        sessionToken: state.sessionToken,
        conversations: state.conversations,
        activeConversationId: conversationId,
        messages,
        reauthRequired: state.reauthRequired
      });
      return {
        activeConversationId: conversationId,
        messages
      };
    }),
  acknowledgeReauth: () =>
    set((state) => {
      const next = {
        ...state,
        reauthRequired: false
      };
      saveState(next);
      return {
        reauthRequired: false
      };
    }),
  updateUncertaintyReviewStatus: ({
    messageId,
    uncertaintyId,
    reviewStatus
  }: {
    messageId: string;
    uncertaintyId: string;
    reviewStatus: ChatStudioUncertaintyReviewStatus;
  }) =>
    set((state) => {
      let changed = false;
      const now = Date.now();
      const conversations = state.conversations.map((conversation) => {
        let conversationChanged = false;
        const messages = conversation.messages.map((message) => {
          if (
            message.id !== messageId ||
            message.role !== "assistant" ||
            !message.result
          ) {
            return message;
          }

          let messageChanged = false;
          const uncertaintyItems = message.result.uncertaintyItems.map((item) => {
            if (
              item.id !== uncertaintyId ||
              item.reviewStatus === reviewStatus
            ) {
              return item;
            }

            messageChanged = true;
            return {
              ...item,
              reviewStatus
            };
          });

          if (!messageChanged) {
            return message;
          }

          changed = true;
          conversationChanged = true;
          return {
            ...message,
            result: {
              ...message.result,
              uncertaintyItems
            }
          };
        });

        if (!conversationChanged) {
          return conversation;
        }

        return {
          ...conversation,
          updatedAt: now,
          messages
        };
      });

      if (!changed) {
        return {};
      }

      const next = {
        ...state,
        conversations,
        messages: getMessagesForConversation(conversations, state.activeConversationId)
      };
      saveState(next);
      return {
        conversations: next.conversations,
        messages: next.messages
      };
    }),
  sendFollowUpPrompt: async (prompt: string) => {
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt) {
      return;
    }

    await get().send(normalizedPrompt);
  },
  send: async (input: string | ChatSendInput) => {
    const normalizedInput = normalizeSendInput(input);
    const userMessage: ChatMessage = {
      id: makeId(),
      role: "user",
      content: normalizedInput.content,
      attachments:
        normalizedInput.attachments.length > 0
          ? normalizedInput.attachments
          : undefined
    };

    let targetConversationId = "";
    set((state) => {
      const { next, targetConversationId: resolvedConversationId } =
        buildStateWithUserMessage({
          state,
          normalizedInput,
          userMessage
        });
      targetConversationId = resolvedConversationId;
      saveState(next);
      return {
        conversations: next.conversations,
        activeConversationId: next.activeConversationId,
        messages: next.messages,
        isSending: true
      };
    });

    const finishSend = (
      assistantMessage: ChatMessage,
      overrides: Partial<
        Pick<PersistableChatState, "sessionToken" | "reauthRequired">
      > = {}
    ) => {
      set((state) => {
        const next = buildStateWithAssistantMessage(
          state,
          targetConversationId,
          assistantMessage,
          overrides
        );
        saveState(next);
        return {
          conversations: next.conversations,
          messages: next.messages,
          isSending: false,
          sessionToken: next.sessionToken,
          reauthRequired: next.reauthRequired
        };
      });
    };

    try {
      const runtime = await deps.resolveCompileOptions({
        conversationId: targetConversationId,
        mode: get().mode
      });
      const guard = resolveChatSendGuard({
        mode: get().mode,
        runtime,
        attachments: normalizedInput.attachments
      });
      if (guard) {
        if ("logEvent" in guard) {
          deps.logEvent(guard.logEvent);
        }
        if ("openSettings" in guard && guard.openSettings) {
          settingsStore.getState().setDrawerOpen(true);
        }

        finishSend(
          buildAssistantMessageFromGuard({
            id: makeId(),
            guard
          })
        );
        return;
      }

      deps.logEvent({
        level: "info",
        message: `发送请求：target=${runtime.runtimeTarget} mode=${get().mode} model=${runtime.model ?? "default"}`
      });

      let lastError: unknown;
      let compileResult:
        | {
            batch: CommandBatch;
            agentSteps: RuntimeCompileResponse["agent_steps"];
            traceId: RuntimeCompileResponse["trace_id"];
          }
        | undefined;

      for (let attempt = 0; attempt <= runtime.retryAttempts; attempt += 1) {
        try {
          const targetConversation = get().conversations.find(
            (item) => item.id === targetConversationId
          );
          const context = buildCompileContext({
            conversation: targetConversation,
            sceneTransactions: sceneStore.getState().transactions
          });
          const response = await deps.compile({
            message: normalizedInput.content,
            attachments: normalizedInput.attachments,
            mode: get().mode,
            runtimeTarget: runtime.runtimeTarget,
            runtimeBaseUrl: runtime.runtimeBaseUrl,
            sessionToken: get().sessionToken,
            model: runtime.model,
            byokEndpoint: runtime.byokEndpoint,
            byokKey: runtime.byokKey,
            timeoutMs: runtime.timeoutMs,
            extraHeaders: runtime.extraHeaders,
            context
          });
          compileResult = {
            batch: response.batch,
            agentSteps: response.agent_steps,
            traceId: response.trace_id
          };
          break;
        } catch (error) {
          lastError = error;
          const isSessionExpired = isOfficialSessionExpiredError(
            error,
            get().mode
          );
          const shouldRetry = !isSessionExpired && attempt < runtime.retryAttempts;
          deps.logEvent({
            level: shouldRetry ? "info" : "error",
            message: shouldRetry
              ? `请求失败，准备重试 (${attempt + 1}/${runtime.retryAttempts})`
              : "请求失败，停止重试"
          });
          if (!shouldRetry) {
            throw error;
          }
        }
      }

      if (!compileResult) {
        throw lastError ?? new Error("Compile result is empty");
      }

      const { batch, agentSteps, traceId } = compileResult;
      await deps.execute(batch);
      sceneStore.getState().recordTransaction(batch);

      finishSend(
        buildAssistantMessageFromCompileResult({
          id: makeId(),
          batch,
          traceId,
          agentSteps
        })
      );
    } catch (error) {
      const isSessionExpired = isOfficialSessionExpiredError(error, get().mode);
      finishSend(
        buildAssistantMessageFromError({
          id: makeId(),
          error,
          mode: get().mode
        }),
        {
          sessionToken: isSessionExpired ? null : get().sessionToken,
          reauthRequired: isSessionExpired ? true : get().reauthRequired
        }
      );
    }
  }
});
