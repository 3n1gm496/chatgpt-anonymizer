import { afterEach, describe, expect, it } from 'vitest';

import {
  getSettings,
  normalizeEngineBaseUrl,
} from '../../services/settingsStore';

describe('settingsStore', () => {
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

  it('normalizes a valid localhost engine url', () => {
    expect(normalizeEngineBaseUrl('http://127.0.0.1:8765/')).toBe(
      'http://127.0.0.1:8765',
    );
  });

  it('rejects non-local engine urls', () => {
    expect(() => normalizeEngineBaseUrl('https://example.com')).toThrow(
      /127\.0\.0\.1/,
    );
  });

  it('defaults to keeping automatic manual review disabled', async () => {
    await expect(getSettings()).resolves.toMatchObject({
      showLowConfidenceDrawer: false,
    });
  });

  it('falls back to safe defaults when storage get returns undefined', async () => {
    (
      globalThis as typeof globalThis & {
        browser?: {
          storage?: {
            local?: {
              get: (
                key: string,
              ) => Promise<Record<string, unknown> | undefined>;
              set: (items: Record<string, unknown>) => Promise<void>;
            };
          };
        };
      }
    ).browser = {
      storage: {
        local: {
          get: async () => undefined,
          set: async () => undefined,
        },
      },
    };

    await expect(getSettings()).resolves.toMatchObject({
      engineBaseUrl: 'http://127.0.0.1:8765',
    });
  });
});
