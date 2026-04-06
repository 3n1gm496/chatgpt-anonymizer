import { afterEach, describe, expect, it } from 'vitest';

import {
  beginSanitizationRequest,
  buildSessionScope,
  clearSessionState,
  completeSanitizationRequest,
  createDefaultSessionState,
  getSessionState,
  saveSessionState,
} from '../../services/sessionStore';

describe('sessionStore', () => {
  const originalBrowser = (
    globalThis as typeof globalThis & {
      browser?: unknown;
    }
  ).browser;

  afterEach(() => {
    (
      globalThis as typeof globalThis & {
        browser?: unknown;
      }
    ).browser = originalBrowser;
  });

  it('builds a tab-scoped engine conversation id', () => {
    expect(buildSessionScope(3, 'chat:abc')).toMatchObject({
      engineConversationId: 'tab:3:chat:abc',
      sessionKey: 'chatgpt-anonymizer/session/tab:3:chat:abc',
    });
  });

  it('adds a page-local fallback token when the runtime tab id is unavailable', () => {
    expect(
      buildSessionScope(0, 'chat:abc', {
        fallbackScopeId: 'page-123',
      }),
    ).toMatchObject({
      engineConversationId: 'tab:0:chat:abc:fallback:page-123',
      sessionKey: 'chatgpt-anonymizer/session/tab:0:chat:abc:fallback:page-123',
    });
  });

  it('expires stale state on read', async () => {
    const scope = buildSessionScope(4, 'chat:abc');
    await saveSessionState({
      ...createDefaultSessionState(scope),
      expiresAt: '2000-01-01T00:00:00+00:00',
    });

    await expect(getSessionState(scope.sessionKey)).resolves.toBeNull();
  });

  it('commits only the latest pending sanitize request', async () => {
    const scope = buildSessionScope(5, 'chat:abc');
    const first = await beginSanitizationRequest(scope, {
      composerFingerprint: 'composer-a',
      engineHealthy: true,
    });
    const second = await beginSanitizationRequest(scope, {
      composerFingerprint: 'composer-b',
      engineHealthy: true,
    });

    await expect(
      completeSanitizationRequest(scope.sessionKey, first.requestId, {
        sanitizedText: 'first',
      }),
    ).resolves.toMatchObject({
      committed: false,
    });

    await expect(
      completeSanitizationRequest(scope.sessionKey, second.requestId, {
        sanitizedText: 'second',
      }),
    ).resolves.toMatchObject({
      committed: true,
    });

    await clearSessionState(scope.sessionKey);
  });

  it('treats undefined storage get results as an empty store', async () => {
    (
      globalThis as typeof globalThis & {
        browser?: {
          storage?: {
            session?: {
              get: (
                key: string,
              ) => Promise<Record<string, unknown> | undefined>;
              set: (items: Record<string, unknown>) => Promise<void>;
              remove: (key: string) => Promise<void>;
            };
          };
        };
      }
    ).browser = {
      storage: {
        session: {
          get: async () => undefined,
          set: async () => undefined,
          remove: async () => undefined,
        },
      },
    };

    await expect(
      getSessionState(
        'chatgpt-anonymizer/session/tab:0:chat:new:fallback:test',
      ),
    ).resolves.toBeNull();
  });
});
