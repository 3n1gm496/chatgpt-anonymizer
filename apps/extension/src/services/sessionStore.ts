import type { ReplacementDecision } from '@chatgpt-anonymizer/contracts';

export interface SessionScope {
  tabId: number;
  conversationId: string;
  engineConversationId: string;
  sessionKey: string;
}

export interface SanitizationState {
  sessionKey: string;
  tabId: number;
  conversationId: string;
  engineConversationId: string;
  sessionId?: string;
  sanitizedText?: string;
  sanitizedFingerprint?: string;
  sourceTextFingerprint?: string;
  composerFingerprint?: string;
  replacementCount: number;
  lowConfidenceCount: number;
  reviewPending: boolean;
  reviewDecisions: Record<string, ReplacementDecision>;
  engineHealthy: boolean;
  pendingRequestId?: string;
  lastCompletedRequestId?: string;
  revision: number;
  sanitizedAt?: string;
  expiresAt?: string;
  unsafeAttachmentsPresent?: boolean;
  unsafeAttachmentsReason?: string;
}

const PREFIX = 'chatgpt-anonymizer/session/';

type StorageLike = {
  get(keys: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove?(keys: string): Promise<void>;
};

const memoryStorage = new Map<string, unknown>();
const extensionGlobal = globalThis as typeof globalThis & {
  browser?: {
    storage?: {
      session?: {
        get: (keys: string) => Promise<Record<string, unknown>>;
        set: (items: Record<string, unknown>) => Promise<void>;
        remove: (keys: string) => Promise<void>;
      };
      local?: {
        get: (keys: string) => Promise<Record<string, unknown>>;
        set: (items: Record<string, unknown>) => Promise<void>;
        remove: (keys: string) => Promise<void>;
      };
    };
  };
  chrome?: {
    storage?: {
      session?: {
        get: (
          keys: string,
          callback: (items: Record<string, unknown>) => void,
        ) => void;
        set: (items: Record<string, unknown>, callback?: () => void) => void;
        remove: (keys: string, callback?: () => void) => void;
      };
      local?: {
        get: (
          keys: string,
          callback: (items: Record<string, unknown>) => void,
        ) => void;
        set: (items: Record<string, unknown>, callback?: () => void) => void;
        remove: (keys: string, callback?: () => void) => void;
      };
    };
  };
  crypto?: Crypto;
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
    remove(key) {
      memoryStorage.delete(key);
      return Promise.resolve();
    },
  };
}

function normalizeStorageRecord(
  value: Record<string, unknown> | undefined | null,
): Record<string, unknown> {
  return value ?? {};
}

function getStorage(): StorageLike {
  if (extensionGlobal.browser?.storage?.session) {
    return extensionGlobal.browser.storage.session;
  }

  if (extensionGlobal.browser?.storage?.local) {
    return extensionGlobal.browser.storage.local;
  }

  if (extensionGlobal.chrome?.storage?.session) {
    return {
      get: (key) =>
        new Promise((resolve) => {
          extensionGlobal.chrome?.storage?.session?.get(key, (items) => {
            resolve(normalizeStorageRecord(items));
          });
        }),
      set: (items) =>
        new Promise((resolve) => {
          extensionGlobal.chrome?.storage?.session?.set(items, resolve);
        }),
      remove: (key) =>
        new Promise((resolve) => {
          extensionGlobal.chrome?.storage?.session?.remove(key, resolve);
        }),
    };
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
      remove: (key) =>
        new Promise((resolve) => {
          extensionGlobal.chrome?.storage?.local?.remove(key, resolve);
        }),
    };
  }

  return buildMemoryStorage();
}

function createOperationId(): string {
  if (extensionGlobal.crypto?.randomUUID) {
    return extensionGlobal.crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isExpired(state: SanitizationState, now = Date.now()): boolean {
  if (!state.expiresAt) {
    return false;
  }

  const expiry = Date.parse(state.expiresAt);
  return Number.isFinite(expiry) ? expiry <= now : false;
}

export function buildEngineConversationId(
  tabId: number,
  conversationId: string,
  options?: { fallbackScopeId?: string | null },
): string {
  const base = `tab:${tabId}:${conversationId}`;
  if (tabId !== 0 || !options?.fallbackScopeId) {
    return base;
  }

  const safeToken = options.fallbackScopeId.replace(/[^a-zA-Z0-9_-]/g, '');
  return `${base}:fallback:${safeToken || 'page'}`;
}

export function buildSessionKey(
  tabId: number,
  conversationId: string,
  options?: { fallbackScopeId?: string | null },
): string {
  return `${PREFIX}${buildEngineConversationId(tabId, conversationId, options)}`;
}

export function buildSessionScope(
  tabId: number,
  conversationId: string,
  options?: { fallbackScopeId?: string | null },
): SessionScope {
  // The engine and extension must agree on one tab-scoped identity so duplicated
  // ChatGPT tabs do not silently share reversible mappings.
  return {
    tabId,
    conversationId,
    engineConversationId: buildEngineConversationId(
      tabId,
      conversationId,
      options,
    ),
    sessionKey: buildSessionKey(tabId, conversationId, options),
  };
}

export function createDefaultSessionState(
  scope: SessionScope,
): SanitizationState {
  return {
    sessionKey: scope.sessionKey,
    tabId: scope.tabId,
    conversationId: scope.conversationId,
    engineConversationId: scope.engineConversationId,
    replacementCount: 0,
    lowConfidenceCount: 0,
    reviewPending: false,
    reviewDecisions: {},
    engineHealthy: true,
    revision: 0,
    unsafeAttachmentsPresent: false,
  };
}

export async function getSessionState(
  sessionKey: string,
): Promise<SanitizationState | null> {
  const stored = normalizeStorageRecord(await getStorage().get(sessionKey));
  const state = (stored[sessionKey] as SanitizationState | undefined) ?? null;
  if (!state) {
    return null;
  }

  if (isExpired(state)) {
    await getStorage().remove?.(sessionKey);
    return null;
  }

  return {
    ...state,
    reviewDecisions: { ...state.reviewDecisions },
    unsafeAttachmentsPresent: state.unsafeAttachmentsPresent ?? false,
  };
}

export async function saveSessionState(
  state: SanitizationState,
): Promise<SanitizationState> {
  await getStorage().set({ [state.sessionKey]: state });
  return state;
}

export async function patchSessionState(
  sessionKey: string,
  patch: Partial<SanitizationState>,
): Promise<SanitizationState | null> {
  const current = await getSessionState(sessionKey);
  if (!current) {
    return null;
  }
  const next = {
    ...current,
    ...patch,
    reviewDecisions: {
      ...current.reviewDecisions,
      ...(patch.reviewDecisions ?? {}),
    },
  };
  await saveSessionState(next);
  return next;
}

export async function ensureSessionState(
  scope: SessionScope,
): Promise<SanitizationState> {
  const existing = await getSessionState(scope.sessionKey);
  if (existing) {
    return existing;
  }

  const created = createDefaultSessionState(scope);
  await saveSessionState(created);
  return created;
}

export async function beginSanitizationRequest(
  scope: SessionScope,
  patch: Pick<SanitizationState, 'composerFingerprint' | 'engineHealthy'>,
): Promise<{ requestId: string; state: SanitizationState }> {
  const current = await ensureSessionState(scope);
  const requestId = createOperationId();
  // Only the latest pending request is allowed to commit, so rapid consecutive
  // pastes cannot overwrite a newer sanitize result with a stale response.
  const next: SanitizationState = {
    ...current,
    ...scope,
    composerFingerprint: patch.composerFingerprint,
    engineHealthy: patch.engineHealthy,
    pendingRequestId: requestId,
    revision: current.revision + 1,
  };
  await saveSessionState(next);
  return { requestId, state: next };
}

export async function completeSanitizationRequest(
  sessionKey: string,
  requestId: string,
  patch: Partial<SanitizationState>,
): Promise<{ committed: boolean; state: SanitizationState | null }> {
  const current = await getSessionState(sessionKey);
  if (!current || current.pendingRequestId !== requestId) {
    return { committed: false, state: current };
  }

  const next: SanitizationState = {
    ...current,
    ...patch,
    reviewDecisions: {
      ...current.reviewDecisions,
      ...(patch.reviewDecisions ?? {}),
    },
    pendingRequestId: undefined,
    lastCompletedRequestId: requestId,
    revision: current.revision + 1,
  };
  await saveSessionState(next);
  return { committed: true, state: next };
}

export async function failSanitizationRequest(
  sessionKey: string,
  requestId: string,
  patch: Partial<SanitizationState>,
): Promise<SanitizationState | null> {
  const current = await getSessionState(sessionKey);
  if (!current || current.pendingRequestId !== requestId) {
    return current;
  }

  const next: SanitizationState = {
    ...current,
    ...patch,
    pendingRequestId: undefined,
    revision: current.revision + 1,
  };
  await saveSessionState(next);
  return next;
}

export async function persistReviewDecisions(
  sessionKey: string,
  decisions: Record<string, ReplacementDecision>,
): Promise<SanitizationState | null> {
  return patchSessionState(sessionKey, {
    reviewDecisions: decisions,
  });
}

export async function clearSessionState(sessionKey: string): Promise<void> {
  await getStorage().remove?.(sessionKey);
}
