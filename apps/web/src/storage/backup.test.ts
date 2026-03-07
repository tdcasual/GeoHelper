import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  exportBackup,
  exportCurrentAppBackup,
  importAppBackupToLocalStorage,
  importBackup,
  inspectBackup
} from "./backup";
import { registerGeoGebraAdapter } from "../geogebra/adapter";
import { chatStore, CHAT_STORE_KEY } from "../state/chat-store";
import { SETTINGS_KEY } from "../state/settings-store";
import { SCENE_STORE_KEY, sceneStore } from "../state/scene-store";
import { UI_PREFS_KEY, uiStore } from "../state/ui-store";

const TEMPLATE_STORE_KEY = "geohelper.templates.snapshot";

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

describe("backup", () => {
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: createMemoryStorage()
    });
  });

  beforeEach(() => {
    chatStore.setState({
      mode: "byok",
      sessionToken: null,
      conversations: [
        {
          id: "conv_local",
          title: "Local",
          createdAt: 1,
          updatedAt: 1,
          messages: []
        }
      ],
      activeConversationId: "conv_local",
      messages: [],
      isSending: false,
      reauthRequired: false
    });
    sceneStore.setState({
      schemaVersion: 1,
      transactions: [],
      isRollingBack: false
    });
    uiStore.setState({
      chatVisible: true,
      historyDrawerVisible: false,
      historyDrawerWidth: 280
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: originalLocalStorage
    });
    registerGeoGebraAdapter(null);
  });

  it("round-trips conversations and settings", async () => {
    const blob = await exportBackup({
      conversations: [{ id: "c1" }],
      settings: { chatVisible: false }
    });
    const restored = await importBackup(blob);

    expect(restored.conversations[0].id).toBe("c1");
    expect(restored.settings.chatVisible).toBe(false);
  });

  it("exports and restores local snapshots", async () => {
    localStorage.setItem(
      CHAT_STORE_KEY,
      JSON.stringify({
        mode: "byok",
        conversations: [{ id: "conv_1", messages: [] }]
      })
    );
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        schemaVersion: 2,
        defaultMode: "byok",
        byokPresets: [],
        officialPresets: []
      })
    );
    localStorage.setItem(
      UI_PREFS_KEY,
      JSON.stringify({
        chatVisible: false
      })
    );
    localStorage.setItem(
      TEMPLATE_STORE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        templates: [{ id: "tpl_1", title: "圆", prompt: "画一个圆", updatedAt: 1 }]
      })
    );
    localStorage.setItem(
      SCENE_STORE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        transactions: [
          {
            id: "scene_tx_1",
            sceneId: "scene_1",
            transactionId: "tx_1",
            executedAt: 123,
            commandCount: 1,
            sceneSnapshot: "<xml><element label='A' /></xml>",
            source: "manual",
            batch: {
              version: "1.0",
              scene_id: "scene_1",
              transaction_id: "tx_1",
              commands: [],
              post_checks: [],
              explanations: []
            }
          }
        ]
      })
    );

    const blob = await exportCurrentAppBackup();
    localStorage.removeItem(CHAT_STORE_KEY);
    localStorage.removeItem(SETTINGS_KEY);
    localStorage.removeItem(UI_PREFS_KEY);
    localStorage.removeItem(TEMPLATE_STORE_KEY);
    localStorage.removeItem(SCENE_STORE_KEY);

    await importAppBackupToLocalStorage(blob, { mode: "replace" });

    const chatSnapshot = JSON.parse(localStorage.getItem(CHAT_STORE_KEY) ?? "{}");
    const settingsSnapshot = JSON.parse(
      localStorage.getItem(SETTINGS_KEY) ?? "{}"
    );
    const uiPreferences = JSON.parse(localStorage.getItem(UI_PREFS_KEY) ?? "{}");
    const templatesSnapshot = JSON.parse(
      localStorage.getItem(TEMPLATE_STORE_KEY) ?? "{}"
    );
    const sceneSnapshot = JSON.parse(
      localStorage.getItem(SCENE_STORE_KEY) ?? "{}"
    );

    expect(chatSnapshot.conversations[0].id).toBe("conv_1");
    expect(settingsSnapshot.schemaVersion).toBe(2);
    expect(uiPreferences.chatVisible).toBe(false);
    expect(templatesSnapshot.templates[0].id).toBe("tpl_1");
    expect(sceneSnapshot.transactions[0].sceneSnapshot).toBe(
      "<xml><element label='A' /></xml>"
    );
  });

  it("merges backup conversations by id and updatedAt", async () => {
    localStorage.setItem(
      CHAT_STORE_KEY,
      JSON.stringify({
        mode: "byok",
        sessionToken: null,
        activeConversationId: "conv_legacy",
        reauthRequired: false,
        messages: [{ id: "m2", role: "user", content: "legacy" }],
        conversations: [
          {
            id: "conv_shared",
            title: "shared_old",
            createdAt: 1,
            updatedAt: 100,
            messages: [{ id: "m1", role: "user", content: "old" }]
          },
          {
            id: "conv_legacy",
            title: "legacy",
            createdAt: 2,
            updatedAt: 200,
            messages: [{ id: "m2", role: "user", content: "legacy" }]
          }
        ]
      })
    );
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        schemaVersion: 2,
        defaultMode: "byok",
        byokPresets: [
          {
            id: "preset_1",
            name: "preset_old",
            model: "gpt-4o-mini",
            endpoint: "",
            temperature: 0.2,
            maxTokens: 1200,
            timeoutMs: 20000,
            updatedAt: 100
          }
        ],
        officialPresets: []
      })
    );
    localStorage.setItem(UI_PREFS_KEY, JSON.stringify({ chatVisible: true }));
    localStorage.setItem(
      TEMPLATE_STORE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        templates: [
          {
            id: "tpl_shared",
            title: "shared_old",
            prompt: "old",
            updatedAt: 100
          }
        ]
      })
    );

    const blob = await exportBackup({
      conversations: [
        {
          id: "conv_shared",
          title: "shared_new",
          createdAt: 1,
          updatedAt: 300,
          messages: [{ id: "m3", role: "assistant", content: "new" }]
        },
        {
          id: "conv_from_backup",
          title: "backup",
          createdAt: 3,
          updatedAt: 250,
          messages: []
        }
      ],
      settings: {
        chat_snapshot: {
          mode: "byok",
          sessionToken: null,
          activeConversationId: "conv_from_backup",
          reauthRequired: false,
          messages: [],
          conversations: [
            {
              id: "conv_shared",
              title: "shared_new",
              createdAt: 1,
              updatedAt: 300,
              messages: [{ id: "m3", role: "assistant", content: "new" }]
            },
            {
              id: "conv_from_backup",
              title: "backup",
              createdAt: 3,
              updatedAt: 250,
              messages: []
            }
          ]
        },
        settings_snapshot: {
          schemaVersion: 2,
          defaultMode: "official",
          byokPresets: [
            {
              id: "preset_1",
              name: "preset_new",
              model: "gpt-4o-mini",
              endpoint: "",
              temperature: 0.2,
              maxTokens: 1200,
              timeoutMs: 20000,
              updatedAt: 300
            }
          ],
          officialPresets: [
            {
              id: "official_1",
              name: "official",
              model: "gpt-4o-mini",
              temperature: 0.2,
              maxTokens: 1200,
              timeoutMs: 20000,
              updatedAt: 150
            }
          ]
        },
        ui_preferences: {
          chatVisible: false
        },
        templates_snapshot: {
          schemaVersion: 1,
          templates: [
            {
              id: "tpl_shared",
              title: "shared_new",
              prompt: "new",
              updatedAt: 300
            },
            {
              id: "tpl_backup",
              title: "backup",
              prompt: "backup",
              updatedAt: 200
            }
          ]
        }
      }
    });

    await importAppBackupToLocalStorage(blob, { mode: "merge" });

    const chatSnapshot = JSON.parse(localStorage.getItem(CHAT_STORE_KEY) ?? "{}");
    const settingsSnapshot = JSON.parse(
      localStorage.getItem(SETTINGS_KEY) ?? "{}"
    );
    const uiPreferences = JSON.parse(localStorage.getItem(UI_PREFS_KEY) ?? "{}");
    const templatesSnapshot = JSON.parse(
      localStorage.getItem(TEMPLATE_STORE_KEY) ?? "{}"
    );

    expect(chatSnapshot.conversations.map((item: { id: string }) => item.id)).toEqual(
      ["conv_shared", "conv_from_backup", "conv_legacy"]
    );
    expect(chatSnapshot.conversations[0].title).toBe("shared_new");
    expect(chatSnapshot.activeConversationId).toBe("conv_legacy");
    expect(chatSnapshot.messages[0].content).toBe("legacy");
    expect(settingsSnapshot.byokPresets[0].name).toBe("preset_new");
    expect(settingsSnapshot.officialPresets[0].id).toBe("official_1");
    expect(uiPreferences.chatVisible).toBe(false);
    expect(templatesSnapshot.templates.map((item: { id: string }) => item.id)).toEqual([
      "tpl_shared",
      "tpl_backup"
    ]);
    expect(templatesSnapshot.templates[0].prompt).toBe("new");
  });

  it("inspects schema direction for migration hint", async () => {
    const blob = await exportBackup({
      conversations: [],
      settings: {}
    });

    const inspected = await inspectBackup(blob);
    expect(inspected.schemaVersion).toBeGreaterThan(0);
    expect(inspected.migrationHint).toBe("compatible");
  });

  it("syncs imported backups into live stores and mounted scene state", async () => {
    const setXmlCalls: string[] = [];
    registerGeoGebraAdapter({
      evalCommand: () => undefined,
      setValue: () => undefined,
      getXML: () => null,
      setXML: (xml) => {
        setXmlCalls.push(xml);
      }
    });

    const conversation = {
      id: "conv_backup",
      title: "Backup",
      createdAt: 10,
      updatedAt: 20,
      messages: [{ id: "msg_1", role: "assistant", content: "hello from backup" }]
    };
    const sceneXml = "<xml><element label='A' /></xml>";
    const blob = await exportBackup({
      conversations: [conversation],
      settings: {
        chat_snapshot: {
          mode: "byok",
          sessionToken: null,
          activeConversationId: conversation.id,
          conversations: [conversation],
          messages: conversation.messages,
          reauthRequired: false
        },
        ui_preferences: {
          chatVisible: false,
          historyDrawerVisible: true,
          historyDrawerWidth: 320
        },
        scene_snapshot: {
          schemaVersion: 1,
          transactions: [
            {
              id: "scene_tx_backup",
              sceneId: "scene_1",
              transactionId: "tx_backup",
              executedAt: 999,
              commandCount: 0,
              sceneSnapshot: sceneXml,
              source: "manual",
              batch: {
                version: "1.0",
                scene_id: "scene_1",
                transaction_id: "tx_backup",
                commands: [],
                post_checks: [],
                explanations: []
              }
            }
          ]
        }
      }
    });

    await importAppBackupToLocalStorage(blob, { mode: "replace" });

    expect(chatStore.getState().activeConversationId).toBe("conv_backup");
    expect(chatStore.getState().messages[0]?.content).toBe("hello from backup");
    expect(uiStore.getState().chatVisible).toBe(false);
    expect(uiStore.getState().historyDrawerVisible).toBe(true);
    expect(sceneStore.getState().transactions).toHaveLength(1);
    expect(sceneStore.getState().transactions[0]?.sceneSnapshot).toBe(sceneXml);
    expect(setXmlCalls).toEqual([sceneXml]);
  });

  it("merges scene snapshots by latest executedAt", async () => {
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
            sceneSnapshot: "<xml><element label='Local' /></xml>",
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

    const blob = await exportBackup({
      conversations: [],
      settings: {
        scene_snapshot: {
          schemaVersion: 1,
          transactions: [
            {
              id: "scene_remote",
              sceneId: "scene_2",
              transactionId: "tx_remote",
              executedAt: 200,
              commandCount: 0,
              sceneSnapshot: "<xml><element label='Remote' /></xml>",
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

    await importAppBackupToLocalStorage(blob, { mode: "merge" });

    const sceneSnapshot = JSON.parse(
      localStorage.getItem(SCENE_STORE_KEY) ?? "{}"
    );

    expect(sceneSnapshot.transactions[0].sceneSnapshot).toBe(
      "<xml><element label='Remote' /></xml>"
    );
  });
});
