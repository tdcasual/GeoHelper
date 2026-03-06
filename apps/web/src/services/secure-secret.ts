export interface EncryptedSecret {
  version: 1;
  algorithm: "AES-GCM";
  iv: string;
  ciphertext: string;
}

export interface SecretService {
  encrypt: (value: string) => Promise<EncryptedSecret>;
  decrypt: (payload: EncryptedSecret) => Promise<string>;
  clear: () => Promise<void>;
}

const DB_NAME = "geohelper.secure-secrets";
const STORE_NAME = "key-store";
const KEY_ID = "settings-key-v1";
const KEY_ALGO = {
  name: "AES-GCM",
  length: 256
} as const;
const IV_LENGTH = 12;

let inMemoryKey: CryptoKey | null = null;

const supportsIndexedDb = (): boolean =>
  typeof indexedDB !== "undefined" && typeof indexedDB.open === "function";

const supportsSubtleCrypto = (): boolean =>
  typeof crypto !== "undefined" &&
  typeof crypto.subtle !== "undefined" &&
  typeof crypto.subtle.encrypt === "function";

const encodeBase64 = (bytes: Uint8Array): string => {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }

  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
};

const cloneBytes = (bytes: Uint8Array): Uint8Array<ArrayBuffer> => {
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  copy.set(bytes);
  return copy;
};

const decodeBase64 = (value: string): Uint8Array<ArrayBuffer> => {
  if (typeof Buffer !== "undefined") {
    return cloneBytes(new Uint8Array(Buffer.from(value, "base64")));
  }

  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const openKeyDb = async (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Failed to open IndexedDB"));
  });

const readKeyFromIndexedDb = async (): Promise<CryptoKey | null> => {
  if (!supportsIndexedDb()) {
    return null;
  }

  const db = await openKeyDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(KEY_ID);
      request.onsuccess = () =>
        resolve((request.result as CryptoKey | undefined) ?? null);
      request.onerror = () =>
        reject(request.error ?? new Error("Failed to read key"));
    });
  } finally {
    db.close();
  }
};

const writeKeyToIndexedDb = async (key: CryptoKey): Promise<void> => {
  if (!supportsIndexedDb()) {
    return;
  }

  const db = await openKeyDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(key, KEY_ID);
      request.onsuccess = () => resolve();
      request.onerror = () =>
        reject(request.error ?? new Error("Failed to persist key"));
    });
  } finally {
    db.close();
  }
};

const clearKeyFromIndexedDb = async (): Promise<void> => {
  if (!supportsIndexedDb()) {
    return;
  }

  const db = await openKeyDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(KEY_ID);
      request.onsuccess = () => resolve();
      request.onerror = () =>
        reject(request.error ?? new Error("Failed to clear key"));
    });
  } finally {
    db.close();
  }
};

const ensureKey = async (): Promise<CryptoKey> => {
  if (!supportsSubtleCrypto()) {
    throw new Error("WebCrypto is unavailable");
  }

  if (inMemoryKey) {
    return inMemoryKey;
  }

  const existing = await readKeyFromIndexedDb();
  if (existing) {
    inMemoryKey = existing;
    return existing;
  }

  const generated = await crypto.subtle.generateKey(KEY_ALGO, false, [
    "encrypt",
    "decrypt"
  ]);
  inMemoryKey = generated;
  await writeKeyToIndexedDb(generated);
  return generated;
};

export const browserSecretService: SecretService = {
  encrypt: async (value) => {
    const key = await ensureKey();
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const encoded = new TextEncoder().encode(value);
    const cipherBuffer = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv
      },
      key,
      encoded
    );

    return {
      version: 1,
      algorithm: "AES-GCM",
      iv: encodeBase64(iv),
      ciphertext: encodeBase64(new Uint8Array(cipherBuffer))
    };
  },
  decrypt: async (payload) => {
    const key = await ensureKey();
    const iv = decodeBase64(payload.iv);
    const cipher = decodeBase64(payload.ciphertext);
    const plainBuffer = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv
      },
      key,
      cipher
    );
    return new TextDecoder().decode(plainBuffer);
  },
  clear: async () => {
    inMemoryKey = null;
    await clearKeyFromIndexedDb();
  }
};
