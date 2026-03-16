import { createBackupEnvelope } from "@geohelper/protocol";
import { describe, expect, it } from "vitest";

import { CHAT_STORE_KEY } from "../state/chat-store";
import { UI_PREFS_KEY } from "../state/ui-store";
import {
  captureCurrentAppImportRollbackAnchor,
  clearImportRollbackAnchor,
  exportBackup,
  importAppBackupToLocalStorage,
  readImportRollbackAnchor,
  recordCurrentAppImportRollbackResult,
  restoreImportRollbackAnchorToLocalStorage
} from "./backup";
import { setupBackupTestEnvironment } from "./backup.test-helpers";

setupBackupTestEnvironment();

describe("backup rollback anchors", () => {
  it("captures, reads, replaces, and clears the latest import rollback anchor", async () => {
    localStorage.setItem(
      CHAT_STORE_KEY,
      JSON.stringify({
        mode: "byok",
        sessionToken: null,
        activeConversationId: "conv_before",
        reauthRequired: false,
        messages: [{ id: "m_before", role: "user", content: "before" }],
        conversations: [
          {
            id: "conv_before",
            title: "before",
            createdAt: 1,
            updatedAt: 10,
            messages: [{ id: "m_before", role: "user", content: "before" }]
          }
        ]
      })
    );

    const firstAnchor = await captureCurrentAppImportRollbackAnchor({
      source: "local_file",
      importMode: "merge",
      sourceDetail: "lesson-a.json"
    });

    expect(firstAnchor.source).toBe("local_file");
    expect(firstAnchor.importMode).toBe("merge");
    expect(firstAnchor.sourceDetail).toBe("lesson-a.json");
    expect(firstAnchor.envelope.conversations[0]?.id).toBe("conv_before");
    expect(firstAnchor.envelope.snapshot_id.length).toBeGreaterThan(0);

    const secondAnchor = await captureCurrentAppImportRollbackAnchor({
      source: "remote_latest",
      importMode: "replace",
      sourceDetail: "snap-remote-latest"
    });

    expect(readImportRollbackAnchor()).toEqual(secondAnchor);

    clearImportRollbackAnchor();
    expect(readImportRollbackAnchor()).toBeNull();
  });

  it("records the post-import result onto the latest rollback anchor", async () => {
    localStorage.setItem(
      CHAT_STORE_KEY,
      JSON.stringify({
        mode: "byok",
        sessionToken: null,
        activeConversationId: "conv_before",
        reauthRequired: false,
        messages: [{ id: "m_before", role: "user", content: "before" }],
        conversations: [
          {
            id: "conv_before",
            title: "before",
            createdAt: 1,
            updatedAt: 10,
            messages: [{ id: "m_before", role: "user", content: "before" }]
          }
        ]
      })
    );

    await captureCurrentAppImportRollbackAnchor({
      source: "local_file",
      importMode: "merge",
      sourceDetail: "lesson-a.json"
    });

    const replacementBlob = await exportBackup({
      conversations: [
        {
          id: "conv_after",
          title: "after",
          createdAt: 2,
          updatedAt: 20,
          messages: [{ id: "m_after", role: "assistant", content: "after" }]
        }
      ],
      settings: {
        chat_snapshot: {
          mode: "byok",
          sessionToken: null,
          activeConversationId: "conv_after",
          reauthRequired: false,
          messages: [{ id: "m_after", role: "assistant", content: "after" }],
          conversations: [
            {
              id: "conv_after",
              title: "after",
              createdAt: 2,
              updatedAt: 20,
              messages: [{ id: "m_after", role: "assistant", content: "after" }]
            }
          ]
        }
      }
    });

    await importAppBackupToLocalStorage(replacementBlob, { mode: "replace" });

    const updatedAnchor = await recordCurrentAppImportRollbackResult();
    expect(updatedAnchor.importedAt).toEqual(expect.any(String));
    expect(updatedAnchor.resultEnvelope?.conversations[0]?.id).toBe("conv_after");
    expect(readImportRollbackAnchor()).toEqual(updatedAnchor);
  });

  it("reads legacy rollback anchors without post-import result metadata", () => {
    const legacyEnvelope = createBackupEnvelope(
      {
        conversations: [
          {
            id: "conv_legacy",
            title: "legacy",
            createdAt: 1,
            updatedAt: 10,
            messages: []
          }
        ],
        settings: {}
      },
      {
        schemaVersion: 3,
        createdAt: "2026-03-14T01:00:00.000Z",
        updatedAt: "2026-03-14T01:00:00.000Z",
        appVersion: "0.0.1",
        snapshotId: "snap-legacy",
        deviceId: "device-legacy"
      }
    );

    localStorage.setItem(
      "geohelper.backup.import_rollback_anchor",
      JSON.stringify({
        capturedAt: "2026-03-14T01:00:00.000Z",
        source: "local_file",
        importMode: "replace",
        sourceDetail: "legacy.json",
        envelope: legacyEnvelope
      })
    );

    expect(readImportRollbackAnchor()).toEqual({
      capturedAt: "2026-03-14T01:00:00.000Z",
      source: "local_file",
      importMode: "replace",
      sourceDetail: "legacy.json",
      envelope: legacyEnvelope,
      importedAt: null,
      resultEnvelope: null
    });
  });

  it("restores local state from the stored import rollback anchor and clears it", async () => {
    localStorage.setItem(
      CHAT_STORE_KEY,
      JSON.stringify({
        mode: "byok",
        sessionToken: null,
        activeConversationId: "conv_before",
        reauthRequired: false,
        messages: [{ id: "m_before", role: "user", content: "before" }],
        conversations: [
          {
            id: "conv_before",
            title: "before",
            createdAt: 1,
            updatedAt: 10,
            messages: [{ id: "m_before", role: "user", content: "before" }]
          }
        ]
      })
    );
    localStorage.setItem(UI_PREFS_KEY, JSON.stringify({ chatVisible: true }));

    await captureCurrentAppImportRollbackAnchor({
      source: "local_file",
      importMode: "replace",
      sourceDetail: "lesson-before.json"
    });

    const replacementBlob = await exportBackup({
      conversations: [
        {
          id: "conv_after",
          title: "after",
          createdAt: 2,
          updatedAt: 20,
          messages: [{ id: "m_after", role: "assistant", content: "after" }]
        }
      ],
      settings: {
        chat_snapshot: {
          mode: "byok",
          sessionToken: null,
          activeConversationId: "conv_after",
          reauthRequired: false,
          messages: [{ id: "m_after", role: "assistant", content: "after" }],
          conversations: [
            {
              id: "conv_after",
              title: "after",
              createdAt: 2,
              updatedAt: 20,
              messages: [{ id: "m_after", role: "assistant", content: "after" }]
            }
          ]
        },
        ui_preferences: {
          chatVisible: false
        }
      }
    });

    await importAppBackupToLocalStorage(replacementBlob, { mode: "replace" });

    let chatSnapshot = JSON.parse(localStorage.getItem(CHAT_STORE_KEY) ?? "{}");
    let uiPreferences = JSON.parse(localStorage.getItem(UI_PREFS_KEY) ?? "{}");
    expect(chatSnapshot.conversations[0]?.id).toBe("conv_after");
    expect(uiPreferences.chatVisible).toBe(false);

    const restoredAnchor = await restoreImportRollbackAnchorToLocalStorage();
    expect(restoredAnchor.sourceDetail).toBe("lesson-before.json");

    chatSnapshot = JSON.parse(localStorage.getItem(CHAT_STORE_KEY) ?? "{}");
    uiPreferences = JSON.parse(localStorage.getItem(UI_PREFS_KEY) ?? "{}");

    expect(chatSnapshot.conversations[0]?.id).toBe("conv_before");
    expect(chatSnapshot.messages[0]?.content).toBe("before");
    expect(uiPreferences.chatVisible).toBe(true);
    expect(readImportRollbackAnchor()).toBeNull();
  });
});
