import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildSessionScope,
  clearSessionState,
  getSessionState,
} from '../../services/sessionStore';
import {
  registerPasteInterceptor,
  sanitizeComposerText,
  sanitizeInterceptedText,
} from '../../chatgpt/pasteInterceptor';

describe('sanitizeInterceptedText', () => {
  const scope = buildSessionScope(1, 'chat:new');

  afterEach(async () => {
    await clearSessionState(scope.sessionKey);
    document.body.innerHTML = '';
  });

  it('sanitizes the full composer text for manually typed prompts', async () => {
    let composerText = 'Contatta user@example.com';
    const adapter = {
      containsComposerTarget: vi.fn(() => true),
      focusComposer: vi.fn(),
      getComposerFingerprint: vi.fn(() => 'composer-a'),
      getComposerText: vi.fn(() => composerText),
      replaceComposerText: vi.fn((nextValue: string) => {
        composerText = nextValue;
        return true;
      }),
    };

    const result = await sanitizeComposerText('manual', {
      adapter,
      sanitize: vi.fn().mockResolvedValue({
        protocolVersion: 'v1',
        sessionId: 'session-1',
        sanitizedText: 'Contatta [EMAIL_001]',
        sanitizedFingerprint: 'a'.repeat(64),
        expiresAt: '2099-04-03T12:45:00+00:00',
        findings: [],
        replacements: [
          {
            findingId: 'finding-1',
            entityType: 'EMAIL',
            start: 9,
            end: 25,
            originalText: 'user@example.com',
            placeholder: '[EMAIL_001]',
            confidence: 0.95,
            applied: true,
          },
        ],
        riskSummary: {
          score: 24,
          level: 'low',
          findingsCount: 1,
          replacementCount: 1,
          lowConfidenceCount: 0,
          ambiguousCount: 0,
          reviewRequired: false,
          entityCounts: {
            EMAIL: 1,
          },
        },
      }),
      scope,
    });

    expect(result).toMatchObject({
      ignored: false,
      originalComposerText: 'Contatta user@example.com',
      sanitizedComposerText: 'Contatta [EMAIL_001]',
    });
    expect(adapter.replaceComposerText).toHaveBeenCalledWith(
      'Contatta [EMAIL_001]',
    );
    await expect(getSessionState(scope.sessionKey)).resolves.toMatchObject({
      replacementCount: 1,
      reviewPending: false,
      sanitizedText: 'Contatta [EMAIL_001]',
    });
  });

  it('sanitizes pasted text and stores scoped session metadata', async () => {
    let composerText = '';
    const adapter = {
      containsComposerTarget: vi.fn(() => true),
      focusComposer: vi.fn(),
      getComposerFingerprint: vi.fn(() => 'composer-a'),
      getComposerText: vi.fn(() => composerText),
      replaceComposerText: vi.fn((text: string) => {
        composerText = text;
        return true;
      }),
    };

    const result = await sanitizeInterceptedText(
      'Email user@example.com',
      'paste',
      {
        adapter,
        sanitize: vi.fn().mockResolvedValue({
          protocolVersion: 'v1',
          sessionId: 'session-1',
          sanitizedText: 'Email [EMAIL_001]',
          sanitizedFingerprint: 'a'.repeat(64),
          expiresAt: '2099-04-03T12:45:00+00:00',
          findings: [],
          replacements: [
            {
              findingId: 'finding-1',
              entityType: 'EMAIL',
              start: 6,
              end: 22,
              originalText: 'user@example.com',
              placeholder: '[EMAIL_001]',
              confidence: 0.95,
              applied: true,
            },
          ],
          riskSummary: {
            score: 24,
            level: 'low',
            findingsCount: 1,
            replacementCount: 1,
            lowConfidenceCount: 0,
            ambiguousCount: 0,
            reviewRequired: false,
            entityCounts: {
              EMAIL: 1,
            },
          },
        }),
        scope,
      },
    );

    expect(result.ignored).toBe(false);
    expect(adapter.replaceComposerText).toHaveBeenCalledWith(
      'Email [EMAIL_001]',
    );
    await expect(getSessionState(scope.sessionKey)).resolves.toMatchObject({
      sessionId: 'session-1',
      replacementCount: 1,
      engineConversationId: 'tab:1:chat:new',
      composerFingerprint: 'composer-a',
    });
  });

  it('accoda un secondo incolla al prompt già protetto invece di sovrascriverlo', async () => {
    let composerText = 'Email [EMAIL_001]';
    const adapter = {
      containsComposerTarget: vi.fn(() => true),
      focusComposer: vi.fn(),
      getComposerFingerprint: vi.fn(() => 'composer-a'),
      getComposerText: vi.fn(() => composerText),
      replaceComposerText: vi.fn((nextValue: string) => {
        composerText = nextValue;
        return true;
      }),
    };

    await clearSessionState(scope.sessionKey);
    const state = await getSessionState(scope.sessionKey);
    expect(state).toBeNull();

    const sanitize = vi
      .fn()
      .mockResolvedValueOnce({
        protocolVersion: 'v1',
        sessionId: 'session-1',
        sanitizedText: 'Email [EMAIL_001]',
        sanitizedFingerprint: 'a'.repeat(64),
        expiresAt: '2099-04-03T12:45:00+00:00',
        findings: [],
        replacements: [
          {
            findingId: 'finding-1',
            entityType: 'EMAIL',
            start: 6,
            end: 22,
            originalText: 'user@example.com',
            placeholder: '[EMAIL_001]',
            confidence: 0.95,
            applied: true,
          },
        ],
        riskSummary: {
          score: 24,
          level: 'low',
          findingsCount: 1,
          replacementCount: 1,
          lowConfidenceCount: 0,
          ambiguousCount: 0,
          reviewRequired: false,
          entityCounts: {
            EMAIL: 1,
          },
        },
      })
      .mockResolvedValueOnce({
        protocolVersion: 'v1',
        sessionId: 'session-1',
        sanitizedText: 'Telefono [PHONE_001]',
        sanitizedFingerprint: 'b'.repeat(64),
        expiresAt: '2099-04-03T12:45:00+00:00',
        findings: [],
        replacements: [
          {
            findingId: 'finding-2',
            entityType: 'PHONE',
            start: 9,
            end: 25,
            originalText: '+39 347 555 0101',
            placeholder: '[PHONE_001]',
            confidence: 0.72,
            applied: true,
          },
        ],
        riskSummary: {
          score: 26,
          level: 'low',
          findingsCount: 1,
          replacementCount: 1,
          lowConfidenceCount: 0,
          ambiguousCount: 0,
          reviewRequired: false,
          entityCounts: {
            PHONE: 1,
          },
        },
      });

    await clearSessionState(scope.sessionKey);
    composerText = '';
    await sanitizeInterceptedText('Email user@example.com', 'paste', {
      adapter,
      sanitize,
      scope,
    });

    await sanitizeInterceptedText('Telefono +39 347 555 0101', 'paste', {
      adapter,
      sanitize,
      scope,
    });

    expect(composerText).toBe('Email [EMAIL_001]\n\nTelefono [PHONE_001]');
    await expect(getSessionState(scope.sessionKey)).resolves.toMatchObject({
      replacementCount: 2,
      lowConfidenceCount: 0,
      reviewPending: false,
      sanitizedText: 'Email [EMAIL_001]\n\nTelefono [PHONE_001]',
    });
  });

  it('ignores stale sanitize responses when a newer request supersedes them', async () => {
    let composerText = '';
    const adapter = {
      containsComposerTarget: vi.fn(() => true),
      focusComposer: vi.fn(),
      getComposerFingerprint: vi.fn(() => 'composer-a'),
      getComposerText: vi.fn(() => composerText),
      replaceComposerText: vi.fn((text: string) => {
        composerText = text;
        return true;
      }),
    };

    let resolveFirst:
      | ((value: {
          protocolVersion: 'v1';
          sessionId: string;
          sanitizedText: string;
          sanitizedFingerprint: string;
          expiresAt: string;
          findings: [];
          replacements: [];
          riskSummary: {
            score: number;
            level: 'low';
            findingsCount: number;
            replacementCount: number;
            lowConfidenceCount: number;
            ambiguousCount: number;
            reviewRequired: boolean;
            entityCounts: Record<string, never>;
          };
        }) => void)
      | null = null;

    const sanitize = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({
        protocolVersion: 'v1',
        sessionId: 'session-2',
        sanitizedText: 'second',
        sanitizedFingerprint: 'b'.repeat(64),
        expiresAt: '2099-04-03T12:45:00+00:00',
        findings: [],
        replacements: [],
        riskSummary: {
          score: 0,
          level: 'low',
          findingsCount: 0,
          replacementCount: 0,
          lowConfidenceCount: 0,
          ambiguousCount: 0,
          reviewRequired: false,
          entityCounts: {},
        },
      });

    const firstPromise = sanitizeInterceptedText('first', 'paste', {
      adapter,
      sanitize,
      scope,
    });
    const secondResult = await sanitizeInterceptedText('second', 'paste', {
      adapter,
      sanitize,
      scope,
    });

    resolveFirst?.({
      protocolVersion: 'v1',
      sessionId: 'session-1',
      sanitizedText: 'first',
      sanitizedFingerprint: 'a'.repeat(64),
      expiresAt: '2099-04-03T12:45:00+00:00',
      findings: [],
      replacements: [],
      riskSummary: {
        score: 0,
        level: 'low',
        findingsCount: 0,
        replacementCount: 0,
        lowConfidenceCount: 0,
        ambiguousCount: 0,
        reviewRequired: false,
        entityCounts: {},
      },
    });

    const firstResult = await firstPromise;

    expect(secondResult.ignored).toBe(false);
    expect(firstResult).toEqual({ ignored: true });
  });

  it('throws when the composer write-back fails so the caller sees an error instead of a false ready state', async () => {
    const adapter = {
      containsComposerTarget: vi.fn(() => true),
      focusComposer: vi.fn(),
      getComposerFingerprint: vi.fn(() => 'composer-a'),
      getComposerText: vi.fn(() => ''),
      replaceComposerText: vi.fn().mockReturnValue(false),
    };

    await expect(
      sanitizeInterceptedText('Email user@example.com', 'paste', {
        adapter,
        sanitize: vi.fn().mockResolvedValue({
          protocolVersion: 'v1',
          sessionId: 'session-1',
          sanitizedText: 'Email [EMAIL_001]',
          sanitizedFingerprint: 'a'.repeat(64),
          expiresAt: '2099-04-03T12:45:00+00:00',
          findings: [],
          replacements: [],
          riskSummary: {
            score: 0,
            level: 'low',
            findingsCount: 0,
            replacementCount: 0,
            lowConfidenceCount: 0,
            ambiguousCount: 0,
            reviewRequired: false,
            entityCounts: {},
          },
        }),
        scope,
      }),
    ).rejects.toThrow('Il campo di testo non è stato trovato');
  });

  it('shows a notice when the user pastes only unsupported files without text', async () => {
    document.body.innerHTML =
      '<main><form><div id="composer"></div></form></main>';
    const composer = document.getElementById('composer')!;
    const onNotice = vi.fn();
    const onAttachmentRisk = vi.fn();
    const stop = registerPasteInterceptor({
      adapter: {
        containsComposerTarget: (target) => target === composer,
        focusComposer: vi.fn(),
        getComposerFingerprint: vi.fn(() => 'composer-a'),
        getComposerText: vi.fn(() => ''),
        replaceComposerText: vi.fn().mockReturnValue(true),
      },
      sanitize: vi.fn(),
      getSessionScope: async () => scope,
      onError: vi.fn(),
      onAttachmentRisk,
      onNotice,
      onProcessing: vi.fn(),
      onSanitized: vi.fn(),
    });

    const event = new Event('paste', {
      bubbles: true,
      cancelable: true,
      composed: true,
    }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', {
      value: {
        files: [
          {
            name: 'archive.bin',
            type: 'application/octet-stream',
            size: 10,
            lastModified: 1,
            text: async () => 'ignored',
          },
        ],
        items: [
          {
            kind: 'file',
            getAsFile: () =>
              ({
                name: 'archive.bin',
                type: 'application/octet-stream',
                size: 10,
                lastModified: 1,
                text: async () => 'ignored',
              }) as File,
          },
        ],
        getData: () => '',
      },
    });

    composer.dispatchEvent(event);

    await vi.waitFor(() => {
      expect(onAttachmentRisk).toHaveBeenCalledWith(
        expect.stringContaining('rimuovili oppure incolla solo il loro testo'),
      );
      expect(onNotice).toHaveBeenCalledWith(
        expect.stringContaining('rimuovili oppure incolla solo il loro testo'),
      );
    });
    stop();
  });

  it('intercepts plain text paste immediately and sanitizes it without waiting for submit', async () => {
    document.body.innerHTML =
      '<main><form><div id="composer"></div></form></main>';
    const composer = document.getElementById('composer')!;
    const sanitize = vi.fn().mockResolvedValue({
      protocolVersion: 'v1',
      sessionId: 'session-1',
      sanitizedText: 'Email [EMAIL_001]',
      sanitizedFingerprint: 'a'.repeat(64),
      expiresAt: '2099-04-03T12:45:00+00:00',
      findings: [],
      replacements: [
        {
          findingId: 'finding-1',
          entityType: 'EMAIL',
          start: 6,
          end: 22,
          originalText: 'user@example.com',
          placeholder: '[EMAIL_001]',
          confidence: 0.95,
          applied: true,
        },
      ],
      riskSummary: {
        score: 24,
        level: 'low',
        findingsCount: 1,
        replacementCount: 1,
        lowConfidenceCount: 0,
        ambiguousCount: 0,
        reviewRequired: false,
        entityCounts: { EMAIL: 1 },
      },
    });
    const onProcessing = vi.fn();
    const onSanitized = vi.fn();
    let composerText = '';
    const stop = registerPasteInterceptor({
      adapter: {
        containsComposerTarget: (target) => target === composer,
        focusComposer: vi.fn(),
        getComposerFingerprint: vi.fn(() => 'composer-a'),
        getComposerText: vi.fn(() => composerText),
        replaceComposerText: vi.fn((text: string) => {
          composerText = text;
          return true;
        }),
      },
      sanitize,
      getSessionScope: async () => scope,
      onError: vi.fn(),
      onAttachmentRisk: vi.fn(),
      onNotice: vi.fn(),
      onProcessing,
      onSanitized,
    });

    const event = new Event('paste', {
      bubbles: true,
      cancelable: true,
      composed: true,
    }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', {
      value: {
        files: [],
        items: [],
        getData: (type: string) =>
          type === 'text/plain' ? 'Email user@example.com' : '',
      },
    });

    composer.dispatchEvent(event);

    await vi.waitFor(() => {
      expect(onSanitized).toHaveBeenCalledWith(
        expect.objectContaining({ ignored: false }),
        'Email user@example.com',
        expect.objectContaining({ hadDirectText: true, hasFiles: false }),
      );
    });

    expect(event.defaultPrevented).toBe(true);
    expect(onProcessing).toHaveBeenCalledWith('paste');
    expect(sanitize).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Email user@example.com' }),
    );

    stop();
  });

  it('sanitizes the extracted content of a textual file-only paste', async () => {
    document.body.innerHTML =
      '<main><form><div id="composer"></div></form></main>';
    const composer = document.getElementById('composer')!;
    const sanitize = vi.fn().mockResolvedValue({
      protocolVersion: 'v1',
      sessionId: 'session-1',
      sanitizedText: 'Contenuto [EMAIL_001]',
      sanitizedFingerprint: 'a'.repeat(64),
      expiresAt: '2099-04-03T12:45:00+00:00',
      findings: [],
      replacements: [
        {
          findingId: 'finding-1',
          entityType: 'EMAIL',
          start: 10,
          end: 26,
          originalText: 'user@example.com',
          placeholder: '[EMAIL_001]',
          confidence: 0.95,
          applied: true,
        },
      ],
      riskSummary: {
        score: 24,
        level: 'low',
        findingsCount: 1,
        replacementCount: 1,
        lowConfidenceCount: 0,
        ambiguousCount: 0,
        reviewRequired: false,
        entityCounts: {
          EMAIL: 1,
        },
      },
    });
    const onSanitized = vi.fn();
    let composerTextFile = '';
    const stop = registerPasteInterceptor({
      adapter: {
        containsComposerTarget: (target) => target === composer,
        focusComposer: vi.fn(),
        getComposerFingerprint: vi.fn(() => 'composer-a'),
        getComposerText: vi.fn(() => composerTextFile),
        replaceComposerText: vi.fn((text: string) => {
          composerTextFile = text;
          return true;
        }),
      },
      sanitize,
      getSessionScope: async () => scope,
      onError: vi.fn(),
      onAttachmentRisk: vi.fn(),
      onNotice: vi.fn(),
      onProcessing: vi.fn(),
      onSanitized,
    });

    const textFile = {
      name: 'payload.txt',
      type: 'text/plain',
      size: 40,
      lastModified: 1,
      text: async () => 'Contenuto user@example.com',
    } as File;
    const event = new Event('paste', {
      bubbles: true,
      cancelable: true,
      composed: true,
    }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', {
      value: {
        files: [textFile],
        items: [{ kind: 'file', getAsFile: () => textFile }],
        getData: () => '',
      },
    });

    composer.dispatchEvent(event);

    await vi.waitFor(() => {
      expect(sanitize).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Contenuto user@example.com',
        }),
      );
      expect(onSanitized).toHaveBeenCalledWith(
        expect.objectContaining({ ignored: false }),
        'Contenuto user@example.com',
        expect.objectContaining({
          hasFiles: true,
          extractedFileCount: 1,
          skippedFileCount: 0,
        }),
      );
    });
    stop();
  });

  it('does not intercept a paste that arrives during active IME composition', async () => {
    document.body.innerHTML =
      '<main><form><div id="composer"></div></form></main>';
    const composer = document.getElementById('composer')!;
    const sanitize = vi.fn();
    const stop = registerPasteInterceptor({
      adapter: {
        containsComposerTarget: (target) => target === composer,
        focusComposer: vi.fn(),
        getComposerFingerprint: vi.fn(() => 'composer-a'),
        getComposerText: vi.fn(() => ''),
        replaceComposerText: vi.fn().mockReturnValue(true),
      },
      sanitize,
      getSessionScope: async () => scope,
      onError: vi.fn(),
      onAttachmentRisk: vi.fn(),
      onNotice: vi.fn(),
      onProcessing: vi.fn(),
      onSanitized: vi.fn(),
    });

    // Begin IME composition (e.g. Japanese input method)
    document.dispatchEvent(new Event('compositionstart', { bubbles: true }));

    const event = new Event('paste', {
      bubbles: true,
      cancelable: true,
      composed: true,
    }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', {
      value: {
        files: [],
        items: [],
        getData: (type: string) =>
          type === 'text/plain' ? 'Email user@example.com' : '',
      },
    });
    composer.dispatchEvent(event);

    // Paste during composition must not be intercepted
    expect(event.defaultPrevented).toBe(false);
    expect(sanitize).not.toHaveBeenCalled();

    // After compositionend the next paste must resume normal interception
    document.dispatchEvent(new Event('compositionend', { bubbles: true }));
    stop();
  });

  it('throws when the composer text does not match after write-back, catching silent DOM overwrites', async () => {
    let composerText = '';
    const adapter = {
      containsComposerTarget: vi.fn(() => true),
      focusComposer: vi.fn(),
      getComposerFingerprint: vi.fn(() => 'composer-a'),
      // getComposerText always returns the original — simulates a DOM overwrite
      getComposerText: vi.fn(() => composerText),
      replaceComposerText: vi.fn(() => {
        // Simulate the DOM accepting the write call but React/framework
        // immediately resetting it back to empty.
        composerText = '';
        return true;
      }),
    };

    await expect(
      sanitizeInterceptedText('Email user@example.com', 'paste', {
        adapter,
        sanitize: vi.fn().mockResolvedValue({
          protocolVersion: 'v1',
          sessionId: 'session-1',
          sanitizedText: 'Email [EMAIL_001]',
          sanitizedFingerprint: 'a'.repeat(64),
          expiresAt: '2099-04-03T12:45:00+00:00',
          findings: [],
          replacements: [
            {
              findingId: 'finding-1',
              entityType: 'EMAIL',
              start: 6,
              end: 22,
              originalText: 'user@example.com',
              placeholder: '[EMAIL_001]',
              confidence: 0.95,
              applied: true,
            },
          ],
          riskSummary: {
            score: 24,
            level: 'low',
            findingsCount: 1,
            replacementCount: 1,
            lowConfidenceCount: 0,
            ambiguousCount: 0,
            reviewRequired: false,
            entityCounts: { EMAIL: 1 },
          },
        }),
        scope,
      }),
    ).rejects.toThrow('Il testo nel composer non corrisponde');
  });

  it('sanitizes text even when the paste payload also contains files, and exposes the file context', async () => {
    document.body.innerHTML =
      '<main><form><div id="composer"></div></form></main>';
    const composer = document.getElementById('composer')!;
    const onSanitized = vi.fn();
    let composerTextWithFiles = '';
    const stop = registerPasteInterceptor({
      adapter: {
        containsComposerTarget: (target) => target === composer,
        focusComposer: vi.fn(),
        getComposerFingerprint: vi.fn(() => 'composer-a'),
        getComposerText: vi.fn(() => composerTextWithFiles),
        replaceComposerText: vi.fn((text: string) => {
          composerTextWithFiles = text;
          return true;
        }),
      },
      sanitize: vi.fn().mockResolvedValue({
        protocolVersion: 'v1',
        sessionId: 'session-1',
        sanitizedText: 'Email [EMAIL_001]',
        sanitizedFingerprint: 'a'.repeat(64),
        expiresAt: '2099-04-03T12:45:00+00:00',
        findings: [],
        replacements: [
          {
            findingId: 'finding-1',
            entityType: 'EMAIL',
            start: 6,
            end: 22,
            originalText: 'user@example.com',
            placeholder: '[EMAIL_001]',
            confidence: 0.95,
            applied: true,
          },
        ],
        riskSummary: {
          score: 24,
          level: 'low',
          findingsCount: 1,
          replacementCount: 1,
          lowConfidenceCount: 0,
          ambiguousCount: 0,
          reviewRequired: false,
          entityCounts: {
            EMAIL: 1,
          },
        },
      }),
      getSessionScope: async () => scope,
      onError: vi.fn(),
      onAttachmentRisk: vi.fn(),
      onNotice: vi.fn(),
      onProcessing: vi.fn(),
      onSanitized,
    });

    const event = new Event('paste', {
      bubbles: true,
      cancelable: true,
      composed: true,
    }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', {
      value: {
        files: { length: 1 },
        items: [{ kind: 'file' }],
        getData: (type: string) =>
          type === 'text/plain' ? 'Email user@example.com' : '',
      },
    });

    composer.dispatchEvent(event);

    await vi.waitFor(() => {
      expect(onSanitized).toHaveBeenCalledWith(
        expect.objectContaining({ ignored: false }),
        'Email user@example.com',
        expect.objectContaining({
          hasFiles: true,
          extractedFileCount: 0,
          skippedFileCount: 0,
          truncated: false,
          hadDirectText: true,
        }),
      );
    });
    stop();
  });
});
