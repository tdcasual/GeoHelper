import { createBackupEnvelope } from "@geohelper/protocol";
import { describe, expect, it } from "vitest";

import { CHAT_STORE_KEY } from "../state/chat-store";
import { SETTINGS_KEY, settingsStore } from "../state/settings-store";
import { UI_PREFS_KEY } from "../state/ui-store";
import {
  exportBackup,
  exportCurrentAppBackupEnvelope,
  importBackup,
  importBackupEnvelopeToLocalStorage,
  importRemoteBackupToLocalStorage
} from "./backup";
import { setupBackupTestEnvironment } from "./backup.test-helpers";

setupBackupTestEnvironment();

describe("backup remote flows", () => {
  it("exports the current app backup as an envelope for gateway upload", async () => {
    localStorage.setItem(
      CHAT_STORE_KEY,
      JSON.stringify({
        mode: "byok",
        sessionToken: null,
        activeConversationId: "conv_local",
        reauthRequired: false,
        messages: [],
        conversations: [
          { id: "conv_local", title: "Local", createdAt: 1, updatedAt: 1, messages: [] }
        ]
      })
    );

    const envelope = await exportCurrentAppBackupEnvelope();

    expect(envelope.conversations[0]?.id).toBe("conv_local");
    expect(envelope.snapshot_id.length).toBeGreaterThan(0);
    expect(envelope.device_id.length).toBeGreaterThan(0);
    expect(envelope.updated_at.length).toBeGreaterThan(0);
    expect(envelope.checksum.length).toBeGreaterThan(0);
  });

  it("restores a fetched remote backup envelope through the remote import helper", async () => {
    localStorage.setItem(
      CHAT_STORE_KEY,
      JSON.stringify({
        mode: "byok",
        sessionToken: null,
        activeConversationId: "conv_local",
        reauthRequired: false,
        messages: [],
        conversations: [
          {
            id: "conv_local",
            title: "Local",
            createdAt: 1,
            updatedAt: 100,
            messages: []
          }
        ]
      })
    );

    const remoteConversation = {
      id: "conv_remote",
      title: "Remote",
      createdAt: 2,
      updatedAt: 200,
      messages: []
    };
    const remoteBlob = await exportBackup({
      conversations: [remoteConversation],
      settings: {
        chat_snapshot: {
          mode: "byok",
          sessionToken: null,
          activeConversationId: remoteConversation.id,
          conversations: [remoteConversation],
          messages: [],
          reauthRequired: false
        },
        ui_preferences: {
          chatVisible: false
        }
      }
    });
    const remoteEnvelope = await importBackup(remoteBlob);

    await importRemoteBackupToLocalStorage({ envelope: remoteEnvelope }, { mode: "merge" });

    const chatSnapshot = JSON.parse(localStorage.getItem(CHAT_STORE_KEY) ?? "{}");
    const uiPreferences = JSON.parse(localStorage.getItem(UI_PREFS_KEY) ?? "{}");

    expect(chatSnapshot.conversations.map((item: { id: string }) => item.id)).toEqual([
      "conv_remote",
      "conv_local"
    ]);
    expect(chatSnapshot.activeConversationId).toBe("conv_local");
    expect(uiPreferences.chatVisible).toBe(false);
  });

  it("imports a gateway-fetched envelope without regressing merge behavior", async () => {
    localStorage.setItem(
      CHAT_STORE_KEY,
      JSON.stringify({
        mode: "byok",
        sessionToken: null,
        activeConversationId: "conv_local",
        reauthRequired: false,
        messages: [],
        conversations: [
          {
            id: "conv_shared",
            title: "shared_old",
            createdAt: 1,
            updatedAt: 100,
            messages: []
          },
          {
            id: "conv_local",
            title: "local",
            createdAt: 2,
            updatedAt: 200,
            messages: []
          }
        ]
      })
    );
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        schemaVersion: 3,
        defaultMode: "byok",
        byokPresets: [
          {
            id: "preset_local",
            name: "preset_local",
            model: "gpt-4o-mini",
            endpoint: "",
            temperature: 0.2,
            maxTokens: 1200,
            timeoutMs: 20000,
            updatedAt: 100
          }
        ],
        officialPresets: [
          {
            id: "official_local",
            name: "official_local",
            model: "gpt-4o-mini",
            temperature: 0.2,
            maxTokens: 1200,
            timeoutMs: 20000,
            updatedAt: 100
          }
        ],
        remoteBackupAdminTokenCipher: {
          version: 1,
          algorithm: "AES-GCM",
          iv: "iv-local",
          ciphertext: "enc:local"
        }
      })
    );

    const envelope = createBackupEnvelope(
      {
        conversations: [
          {
            id: "conv_shared",
            title: "shared_new",
            createdAt: 1,
            updatedAt: 300,
            messages: []
          },
          {
            id: "conv_remote",
            title: "remote",
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
            reauthRequired: false,
            messages: [],
            conversations: [
              {
                id: "conv_shared",
                title: "shared_new",
                createdAt: 1,
                updatedAt: 300,
                messages: []
              },
              {
                id: "conv_remote",
                title: "remote",
                createdAt: 3,
                updatedAt: 250,
                messages: []
              }
            ]
          },
          settings_snapshot: {
            schemaVersion: 3,
            defaultMode: "byok",
            byokPresets: [
              {
                id: "preset_local",
                name: "preset_remote",
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
                id: "official_local",
                name: "official_local",
                model: "gpt-4o-mini",
                temperature: 0.2,
                maxTokens: 1200,
                timeoutMs: 20000,
                updatedAt: 100
              }
            ],
            remoteBackupAdminTokenCipher: {
              version: 1,
              algorithm: "AES-GCM",
              iv: "iv-remote",
              ciphertext: "enc:remote"
            }
          }
        }
      },
      {
        schemaVersion: 2,
        createdAt: "2026-03-12T09:00:00.000Z",
        appVersion: "0.0.1"
      }
    );

    await importBackupEnvelopeToLocalStorage(envelope, { mode: "merge" });

    const chatSnapshot = JSON.parse(localStorage.getItem(CHAT_STORE_KEY) ?? "{}");
    const settingsSnapshot = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}");

    expect(chatSnapshot.conversations.map((item: { id: string }) => item.id)).toEqual([
      "conv_shared",
      "conv_remote",
      "conv_local"
    ]);
    expect(chatSnapshot.conversations[0].title).toBe("shared_new");
    expect(settingsSnapshot.remoteBackupAdminTokenCipher).toEqual({
      version: 1,
      algorithm: "AES-GCM",
      iv: "iv-remote",
      ciphertext: "enc:remote"
    });
    expect(settingsStore.getState().remoteBackupAdminTokenCipher?.ciphertext).toBe(
      "enc:remote"
    );
  });
});
