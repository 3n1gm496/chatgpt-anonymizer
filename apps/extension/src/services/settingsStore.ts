export interface ExtensionSettings {
  engineBaseUrl: string;
  sessionTtlMinutes: number;
  enableResponseRehydration: boolean;
  showLowConfidenceDrawer: boolean;
  debugMode: boolean;
}

const STORAGE_KEY = 'chatgpt-anonymizer/settings';
const DEFAULT_SETTINGS: ExtensionSettings = {
  engineBaseUrl: 'http://127.0.0.1:8765',
  sessionTtlMinutes: 45,
  enableResponseRehydration: false,
  showLowConfidenceDrawer: false,
  debugMode: false,
};

type StorageLike = {
  get(keys: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
};

function normalizeStorageRecord(
  value: Record<string, unknown> | undefined | null,
): Record<string, unknown> {
  return value ?? {};
}

const memoryStorage = new Map<string, unknown>();
const extensionGlobal = globalThis as typeof globalThis & {
  browser?: {
    storage?: {
      local?: {
        get: (keys: string) => Promise<Record<string, unknown>>;
        set: (items: Record<string, unknown>) => Promise<void>;
      };
    };
  };
  chrome?: {
    storage?: {
      local?: {
        get: (
          keys: string,
          callback: (items: Record<string, unknown>) => void,
        ) => void;
        set: (items: Record<string, unknown>, callback?: () => void) => void;
      };
    };
  };
};

function buildMemoryStorage(): StorageLike {
  return {
    get(key) {
      return Promise.resolve({ [key]: memoryStorage.get(key) });
    },
    set(items) {
      for (const [key, value] of Object.entries(items)) {
        memoryStorage.set(key, value);
      }
      return Promise.resolve();
    },
  };
}

function getStorage(): StorageLike {
  if (extensionGlobal.browser?.storage?.local) {
    return extensionGlobal.browser.storage.local;
  }

  if (extensionGlobal.chrome?.storage?.local) {
    return {
      get: (key) =>
        new Promise((resolve) => {
          extensionGlobal.chrome?.storage?.local?.get(key, (items) => {
            resolve(normalizeStorageRecord(items));
          });
        }),
      set: (items) =>
        new Promise((resolve) => {
          extensionGlobal.chrome?.storage?.local?.set(items, resolve);
        }),
    };
  }

  return buildMemoryStorage();
}

export function normalizeEngineBaseUrl(value: string): string {
  const trimmed = value.trim();
  const parsed = new URL(trimmed);

  if (parsed.protocol !== 'http:') {
    throw new Error('Il local engine deve usare http:// su 127.0.0.1.');
  }
  if (parsed.hostname !== '127.0.0.1') {
    throw new Error('Il local engine deve restare vincolato a 127.0.0.1.');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(
      'Il local engine non accetta credenziali, query string o fragment.',
    );
  }

  const port = parsed.port || '8765';
  const portNumber = Number(port);
  if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
    throw new Error('La porta del local engine non e valida.');
  }

  return `http://127.0.0.1:${portNumber}`;
}

function normalizeSettings(
  patch?: Partial<ExtensionSettings>,
): ExtensionSettings {
  const next = {
    ...DEFAULT_SETTINGS,
    ...patch,
  };

  if (
    !Number.isInteger(next.sessionTtlMinutes) ||
    next.sessionTtlMinutes < 5 ||
    next.sessionTtlMinutes > 240
  ) {
    throw new Error('Il TTL di sessione deve restare tra 5 e 240 minuti.');
  }

  return {
    ...next,
    engineBaseUrl: normalizeEngineBaseUrl(next.engineBaseUrl),
  };
}

export async function getSettings(): Promise<ExtensionSettings> {
  const storage = getStorage();
  const stored = normalizeStorageRecord(await storage.get(STORAGE_KEY));
  try {
    return normalizeSettings(
      stored[STORAGE_KEY] as Partial<ExtensionSettings> | undefined,
    );
  } catch {
    const safeDefaults = normalizeSettings();
    await storage.set({ [STORAGE_KEY]: safeDefaults });
    return safeDefaults;
  }
}

export async function saveSettings(
  patch: Partial<ExtensionSettings>,
): Promise<ExtensionSettings> {
  const next = normalizeSettings({
    ...(await getSettings()),
    ...patch,
  });
  await getStorage().set({ [STORAGE_KEY]: next });
  return next;
}
