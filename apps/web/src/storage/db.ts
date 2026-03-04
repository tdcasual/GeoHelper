import Dexie, { type EntityTable } from "dexie";

import { ChatMessage } from "../state/chat-store";
import { STORAGE_SCHEMA_VERSION } from "./migrate";

export interface ConversationRecord {
  id: string;
  messages: ChatMessage[];
  updatedAt: string;
}

export interface SettingRecord {
  key: string;
  value: unknown;
  updatedAt: string;
}

export class GeoHelperDB extends Dexie {
  conversations!: EntityTable<ConversationRecord, "id">;
  settings!: EntityTable<SettingRecord, "key">;

  constructor() {
    super("geohelper-db");
    this.version(STORAGE_SCHEMA_VERSION).stores({
      conversations: "id,updatedAt",
      settings: "key,updatedAt"
    });
  }
}

export const db = new GeoHelperDB();
