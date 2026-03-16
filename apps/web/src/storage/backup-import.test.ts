import { createBackupEnvelope } from "@geohelper/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CHAT_STORE_KEY } from "../state/chat-store";
import { SCENE_STORE_KEY } from "../state/scene-store";
import { SETTINGS_KEY } from "../state/settings-store";
import { TEMPLATE_STORE_KEY } from "../state/template-store";
import { UI_PREFS_KEY } from "../state/ui-store";
import { applyImportedBackupEnvelopeToStorage } from "./backup-import";

const createMemoryStorage = (): Storage => {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    }
  };
};

const createEnvelope = (payload: {
  conversations: Array<Record<string, unknown>>;
  settings: Record<string, unknown>;
}) =>
  createBackupEnvelope(payload, {
    schemaVersion: 3,
    createdAt: "2026-03-16T00:00:00.000Z",
    updatedAt: "2026-03-16T00:00:00.000Z",
    appVersion: "0.0.1",
    deviceId: "device_test"
  });

describe("backup-import", () => {
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: createMemoryStorage()
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: originalLocalStorage
    });
  });

  it("replaces all persisted snapshots in replace mode", async () => {
    const envelope = createEnvelope({
      conversations: [{ id: "conv_1" }],
      settings: {
        chat_snapshot: {
          mode: "byok",
          sessionToken: null,
          activeConversationId: "conv_1",
          conversations: [
            {
              id: "conv_1",
              title: "Conversation",
              createdAt: 1,
              updatedAt: 1,
              messages: []
            }
          ],
          messages: [],
          reauthRequired: false
        },
        settings_snapshot: {
          schemaVersion: 3,
          defaultMode: "official"
        },
        ui_preferences: {
          chatVisible: false
        },
        templates_snapshot: {
          schemaVersion: 1,
          templates: [{ id: "tpl_1", title: "圆", prompt: "画圆", updatedAt: 1 }]
        },
        scene_snapshot: {
          schemaVersion: 1,
          transactions: []
        }
      }
    });

    await applyImportedBackupEnvelopeToStorage(envelope, { mode: "replace" });

    expect(JSON.parse(localStorage.getItem(CHAT_STORE_KEY) ?? "{}")).toMatchObject({
      activeConversationId: "conv_1"
    });
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}")).toMatchObject({
      defaultMode: "official"
    });
    expect(JSON.parse(localStorage.getItem(UI_PREFS_KEY) ?? "{}")).toMatchObject({
      chatVisible: false
    });
    expect(JSON.parse(localStorage.getItem(TEMPLATE_STORE_KEY) ?? "{}")).toMatchObject({
      templates: [{ id: "tpl_1", title: "圆", prompt: "画圆", updatedAt: 1 }]
    });
    expect(JSON.parse(localStorage.getItem(SCENE_STORE_KEY) ?? "{}")).toMatchObject({
      schemaVersion: 1,
      transactions: []
    });
  });

  it("merges conversations and scene snapshots in merge mode", async () => {
    localStorage.setItem(
      CHAT_STORE_KEY,
      JSON.stringify({
        mode: "byok",
        sessionToken: null,
        activeConversationId: "conv_local",
        conversations: [
          {
            id: "conv_shared",
            title: "Shared old",
            createdAt: 1,
            updatedAt: 100,
            messages: []
          },
          {
            id: "conv_local",
            title: "Local",
            createdAt: 2,
            updatedAt: 200,
            messages: []
          }
        ],
        messages: [],
        reauthRequired: false
      })
    );
    localStorage.setItem(
      SCENE_STORE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        transactions: [
          {
            id: "scene_local",
            sceneId: "scene_1",
            transactionId: "tx_local",
            executedAt: 100,
            commandCount: 0,
            sceneSnapshot: "<xml><local /></xml>",
            source: "manual",
            batch: {
              version: "1.0",
              scene_id: "scene_1",
              transaction_id: "tx_local",
              commands: [],
              post_checks: [],
              explanations: []
            }
          }
        ]
      })
    );

    const envelope = createEnvelope({
      conversations: [
        {
          id: "conv_shared",
          title: "Shared new",
          createdAt: 1,
          updatedAt: 300,
          messages: []
        },
        {
          id: "conv_remote",
          title: "Remote",
          createdAt: 3,
          updatedAt: 250,
          messages: []
        }
      ],
      settings: {
        chat_snapshot: {
          mode: "byok",
          sessionToken: null,
          activeConversationId: "conv_remote",
          conversations: [
            {
              id: "conv_shared",
              title: "Shared new",
              createdAt: 1,
              updatedAt: 300,
              messages: []
            },
            {
              id: "conv_remote",
              title: "Remote",
              createdAt: 3,
              updatedAt: 250,
              messages: []
            }
          ],
          messages: [],
          reauthRequired: false
        },
        scene_snapshot: {
          schemaVersion: 1,
          transactions: [
            {
              id: "scene_remote",
              sceneId: "scene_2",
              transactionId: "tx_remote",
              executedAt: 200,
              commandCount: 0,
              sceneSnapshot: "<xml><remote /></xml>",
              source: "manual",
              batch: {
                version: "1.0",
                scene_id: "scene_2",
                transaction_id: "tx_remote",
                commands: [],
                post_checks: [],
                explanations: []
              }
            }
          ]
        }
      }
    });

    await applyImportedBackupEnvelopeToStorage(envelope, { mode: "merge" });

    expect(
      JSON.parse(localStorage.getItem(CHAT_STORE_KEY) ?? "{}").conversations.map(
        (item: { id: string }) => item.id
      )
    ).toEqual(["conv_shared", "conv_remote", "conv_local"]);
    expect(JSON.parse(localStorage.getItem(CHAT_STORE_KEY) ?? "{}")).toMatchObject({
      activeConversationId: "conv_local"
    });
    expect(
      JSON.parse(localStorage.getItem(SCENE_STORE_KEY) ?? "{}").transactions.map(
        (item: { id: string }) => item.id
      )
    ).toEqual(["scene_remote"]);
  });
});
