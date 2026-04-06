import { describe, expect, it, vi } from 'vitest';

import { fingerprintText } from '../../lib/diff';

vi.mock('../../services/localEngineClient', () => ({
  health: vi.fn(),
}));

const { evaluateSubmitGuard, deriveSubmitGuardVerdict, registerSubmitGuard } =
  await import('../../chatgpt/submitGuard');

describe('submit guard state machine', () => {
  it('allows unsanitized manual text without calling the engine', async () => {
    const healthCheck = vi.fn().mockRejectedValue(new Error('down'));

    await expect(
      evaluateSubmitGuard('hello', null, {
        healthCheck,
      }),
    ).resolves.toMatchObject({
      allowed: true,
      state: 'manual_current',
    });

    expect(healthCheck).not.toHaveBeenCalled();
  });

  it('blocks unsanitized manual text when it already looks sensitive', async () => {
    const healthCheck = vi.fn().mockResolvedValue(true);

    await expect(
      evaluateSubmitGuard('Email user@example.com', null, {
        healthCheck,
      }),
    ).resolves.toMatchObject({
      allowed: false,
      state: 'never_sanitized',
    });

    expect(healthCheck).not.toHaveBeenCalled();
  });

  it('does not block solely because a legacy review flag is still present in session state', async () => {
    await expect(
      evaluateSubmitGuard(
        'Email [EMAIL_001]',
        {
          sessionKey: 'scope',
          tabId: 1,
          conversationId: 'chat:new',
          engineConversationId: 'tab:1:chat:new',
          sessionId: 'session-1',
          sanitizedText: 'Email [EMAIL_001]',
          sanitizedFingerprint: await fingerprintText('Email [EMAIL_001]'),
          sourceTextFingerprint: await fingerprintText(
            'Email user@example.com',
          ),
          replacementCount: 1,
          lowConfidenceCount: 1,
          reviewPending: true,
          reviewDecisions: {},
          engineHealthy: true,
          revision: 1,
        },
        {
          healthCheck: vi.fn().mockResolvedValue(true),
        },
      ),
    ).resolves.toMatchObject({
      allowed: true,
      state: 'sanitized_current',
    });
  });

  it('blocks submit when unsafeAttachmentsPresent is true, even with empty composer', async () => {
    await expect(
      evaluateSubmitGuard(
        '',
        {
          sessionKey: 'scope',
          tabId: 1,
          conversationId: 'chat:new',
          engineConversationId: 'tab:1:chat:new',
          sessionId: 'session-1',
          replacementCount: 0,
          lowConfidenceCount: 0,
          reviewPending: false,
          reviewDecisions: {},
          engineHealthy: true,
          revision: 1,
          unsafeAttachmentsPresent: true,
          unsafeAttachmentsReason:
            'Sono presenti file non analizzati completamente.',
        },
        {
          healthCheck: vi.fn().mockResolvedValue(true),
        },
      ),
    ).resolves.toMatchObject({
      allowed: false,
      state: 'unsafe_attachments',
      reason: 'Sono presenti file non analizzati completamente.',
    });
  });

  it('blocks submit when unsafeAttachmentsPresent is true even with already-sanitized text', async () => {
    const sanitizedText = 'Il paziente [PERSON_001] ha chiamato.';
    await expect(
      evaluateSubmitGuard(
        sanitizedText,
        {
          sessionKey: 'scope',
          tabId: 1,
          conversationId: 'chat:new',
          engineConversationId: 'tab:1:chat:new',
          sessionId: 'session-1',
          sanitizedText,
          sanitizedFingerprint: 'fp-sanitized',
          sourceTextFingerprint: 'fp-source',
          replacementCount: 1,
          lowConfidenceCount: 0,
          reviewPending: false,
          reviewDecisions: {},
          engineHealthy: true,
          revision: 1,
          unsafeAttachmentsPresent: true,
          unsafeAttachmentsReason:
            'Sono presenti allegati caricati direttamente in ChatGPT.',
        },
        {
          healthCheck: vi.fn().mockResolvedValue(true),
        },
      ),
    ).resolves.toMatchObject({
      allowed: false,
      state: 'unsafe_attachments',
      reason: 'Sono presenti allegati caricati direttamente in ChatGPT.',
    });
  });

  it('uses the hardcoded fallback reason when unsafeAttachmentsReason is undefined', async () => {
    const result = deriveSubmitGuardVerdict({
      currentText: '',
      currentFingerprint: 'fp',
      sessionState: {
        sessionKey: 'scope',
        tabId: 1,
        conversationId: 'chat:new',
        engineConversationId: 'tab:1:chat:new',
        sessionId: 'session-1',
        replacementCount: 0,
        lowConfidenceCount: 0,
        reviewPending: false,
        reviewDecisions: {},
        engineHealthy: true,
        revision: 1,
        unsafeAttachmentsPresent: true,
      },
      engineReachable: true,
    });
    expect(result).toMatchObject({
      allowed: false,
      state: 'unsafe_attachments',
      reason:
        'Sono presenti allegati nel prompt che non possono essere analizzati. Rimuovili prima di inviare.',
    });
  });

  it('derives engine_unreachable when protected content was changed and health check fails', async () => {
    await expect(
      evaluateSubmitGuard(
        'Email [EMAIL_001]\n\nContatta anche user@example.com',
        {
          sessionKey: 'scope',
          tabId: 1,
          conversationId: 'chat:new',
          engineConversationId: 'tab:1:chat:new',
          sessionId: 'session-1',
          sanitizedText: 'Email [EMAIL_001]',
          sanitizedFingerprint: await fingerprintText('Email [EMAIL_001]'),
          sourceTextFingerprint: await fingerprintText(
            'Email user@example.com',
          ),
          replacementCount: 1,
          lowConfidenceCount: 0,
          reviewPending: false,
          reviewDecisions: {},
          engineHealthy: true,
          revision: 1,
        },
        {
          composerFingerprint: 'composer-a',
          healthCheck: vi.fn().mockRejectedValue(new Error('down')),
        },
      ),
    ).resolves.toMatchObject({
      allowed: false,
      state: 'engine_unreachable',
    });
  });

  it('derives manual_current for unsanitized non-empty text', async () => {
    const currentFingerprint = await fingerprintText('hello');

    expect(
      deriveSubmitGuardVerdict({
        currentText: 'hello',
        currentFingerprint,
        engineReachable: true,
        sessionState: null,
      }),
    ).toMatchObject({
      allowed: true,
      state: 'manual_current',
    });
  });

  it('derives sanitized_current when the fingerprint matches', async () => {
    const sanitizedText = 'Email [EMAIL_001]';
    const sanitizedFingerprint = await fingerprintText(sanitizedText);

    expect(
      deriveSubmitGuardVerdict({
        currentText: sanitizedText,
        currentFingerprint: sanitizedFingerprint,
        engineReachable: true,
        sessionState: {
          sessionKey: 'scope',
          tabId: 1,
          conversationId: 'chat:new',
          engineConversationId: 'tab:1:chat:new',
          sessionId: 'session-1',
          sanitizedText,
          sanitizedFingerprint,
          sourceTextFingerprint: await fingerprintText(
            'Email user@example.com',
          ),
          replacementCount: 1,
          lowConfidenceCount: 0,
          reviewPending: false,
          reviewDecisions: {},
          engineHealthy: true,
          revision: 1,
        },
      }),
    ).toMatchObject({
      allowed: true,
      state: 'sanitized_current',
    });
  });

  it('allows an unchanged protected prompt even if the engine is down', async () => {
    const sanitizedText = 'Email [EMAIL_001]';
    const healthCheck = vi.fn().mockRejectedValue(new Error('down'));

    await expect(
      evaluateSubmitGuard(
        sanitizedText,
        {
          sessionKey: 'scope',
          tabId: 1,
          conversationId: 'chat:new',
          engineConversationId: 'tab:1:chat:new',
          sessionId: 'session-1',
          sanitizedText,
          sanitizedFingerprint: await fingerprintText(sanitizedText),
          sourceTextFingerprint: await fingerprintText(
            'Email user@example.com',
          ),
          replacementCount: 1,
          lowConfidenceCount: 0,
          reviewPending: false,
          reviewDecisions: {},
          engineHealthy: true,
          revision: 1,
        },
        {
          healthCheck,
        },
      ),
    ).resolves.toMatchObject({
      allowed: true,
      state: 'sanitized_current',
    });

    expect(healthCheck).not.toHaveBeenCalled();
  });

  it('allows appending healthy text after protected content', async () => {
    const sanitizedText = 'Email [EMAIL_001]';
    const healthCheck = vi.fn().mockResolvedValue(true);

    await expect(
      evaluateSubmitGuard(
        'Email [EMAIL_001]\n\nScrivimi quando vuoi.',
        {
          sessionKey: 'scope',
          tabId: 1,
          conversationId: 'chat:new',
          engineConversationId: 'tab:1:chat:new',
          sessionId: 'session-1',
          sanitizedText,
          sanitizedFingerprint: await fingerprintText(sanitizedText),
          sourceTextFingerprint: await fingerprintText(
            'Email user@example.com',
          ),
          composerFingerprint: 'composer-a',
          replacementCount: 1,
          lowConfidenceCount: 0,
          reviewPending: false,
          reviewDecisions: {},
          engineHealthy: true,
          revision: 1,
        },
        {
          composerFingerprint: 'composer-a',
          healthCheck,
        },
      ),
    ).resolves.toMatchObject({
      allowed: true,
      state: 'sanitized_current',
    });

    expect(healthCheck).not.toHaveBeenCalled();
  });

  it('does not treat a simple numeric ticket as risky phone-like text', async () => {
    const sanitizedText = 'Email [EMAIL_001]';
    const healthCheck = vi.fn().mockResolvedValue(true);

    await expect(
      evaluateSubmitGuard(
        'Email [EMAIL_001]\n\nTicket 123456',
        {
          sessionKey: 'scope',
          tabId: 1,
          conversationId: 'chat:new',
          engineConversationId: 'tab:1:chat:new',
          sessionId: 'session-1',
          sanitizedText,
          sanitizedFingerprint: await fingerprintText(sanitizedText),
          sourceTextFingerprint: await fingerprintText(
            'Email user@example.com',
          ),
          composerFingerprint: 'composer-a',
          replacementCount: 1,
          lowConfidenceCount: 0,
          reviewPending: false,
          reviewDecisions: {},
          engineHealthy: true,
          revision: 1,
        },
        {
          composerFingerprint: 'composer-a',
          healthCheck,
        },
      ),
    ).resolves.toMatchObject({
      allowed: true,
      state: 'sanitized_current',
    });

    expect(healthCheck).not.toHaveBeenCalled();
  });

  it('blocks appending new risky text after protected content', async () => {
    const sanitizedText = 'Email [EMAIL_001]';

    await expect(
      evaluateSubmitGuard(
        'Email [EMAIL_001]\n\nContatta anche user@example.com',
        {
          sessionKey: 'scope',
          tabId: 1,
          conversationId: 'chat:new',
          engineConversationId: 'tab:1:chat:new',
          sessionId: 'session-1',
          sanitizedText,
          sanitizedFingerprint: await fingerprintText(sanitizedText),
          sourceTextFingerprint: await fingerprintText(
            'Email user@example.com',
          ),
          composerFingerprint: 'composer-a',
          replacementCount: 1,
          lowConfidenceCount: 0,
          reviewPending: false,
          reviewDecisions: {},
          engineHealthy: true,
          revision: 1,
        },
        {
          composerFingerprint: 'composer-b',
          healthCheck: vi.fn().mockResolvedValue(true),
        },
      ),
    ).resolves.toMatchObject({
      allowed: false,
      state: 'stale_after_edit',
    });
  });

  it('blocks appending an unformatted phone number when the surrounding context is phone-like', async () => {
    const sanitizedText = 'Email [EMAIL_001]';

    await expect(
      evaluateSubmitGuard(
        'Email [EMAIL_001]\n\nTelefono 3475550101',
        {
          sessionKey: 'scope',
          tabId: 1,
          conversationId: 'chat:new',
          engineConversationId: 'tab:1:chat:new',
          sessionId: 'session-1',
          sanitizedText,
          sanitizedFingerprint: await fingerprintText(sanitizedText),
          sourceTextFingerprint: await fingerprintText(
            'Email user@example.com',
          ),
          composerFingerprint: 'composer-a',
          replacementCount: 1,
          lowConfidenceCount: 0,
          reviewPending: false,
          reviewDecisions: {},
          engineHealthy: true,
          revision: 1,
        },
        {
          composerFingerprint: 'composer-a',
          healthCheck: vi.fn().mockResolvedValue(true),
        },
      ),
    ).resolves.toMatchObject({
      allowed: false,
      state: 'stale_after_edit',
    });
  });

  it('derives engine_unreachable for significant edits when the engine is down', async () => {
    const sanitizedText = 'Email [EMAIL_001]';

    await expect(
      evaluateSubmitGuard(
        'Email changed and unsafe',
        {
          sessionKey: 'scope',
          tabId: 1,
          conversationId: 'chat:new',
          engineConversationId: 'tab:1:chat:new',
          sessionId: 'session-1',
          sanitizedText,
          sanitizedFingerprint: await fingerprintText(sanitizedText),
          sourceTextFingerprint: await fingerprintText(
            'Email user@example.com',
          ),
          composerFingerprint: 'composer-a',
          replacementCount: 1,
          lowConfidenceCount: 0,
          reviewPending: false,
          reviewDecisions: {},
          engineHealthy: true,
          revision: 1,
        },
        {
          composerFingerprint: 'composer-b',
          healthCheck: vi.fn().mockRejectedValue(new Error('down')),
        },
      ),
    ).resolves.toMatchObject({
      allowed: false,
      state: 'engine_unreachable',
    });
  });

  it('allows minor formatting differences without re-sanitization', async () => {
    const sanitizedText = 'Email [EMAIL_001]';
    const currentText = ' Email   [EMAIL_001] ';

    await expect(
      evaluateSubmitGuard(
        currentText,
        {
          sessionKey: 'scope',
          tabId: 1,
          conversationId: 'chat:new',
          engineConversationId: 'tab:1:chat:new',
          sessionId: 'session-1',
          sanitizedText,
          sanitizedFingerprint: await fingerprintText(sanitizedText),
          sourceTextFingerprint: await fingerprintText(
            'Email user@example.com',
          ),
          composerFingerprint: 'composer-a',
          replacementCount: 1,
          lowConfidenceCount: 0,
          reviewPending: false,
          reviewDecisions: {},
          engineHealthy: true,
          revision: 1,
        },
        {
          composerFingerprint: 'composer-a',
          healthCheck: vi.fn().mockResolvedValue(true),
        },
      ),
    ).resolves.toMatchObject({
      allowed: true,
      state: 'sanitized_current',
    });
  });

  it('does not block submit solely because a native attachment chip is present in the form', async () => {
    document.body.innerHTML = `
      <main>
        <form id="composer-form">
          <div data-testid="attachment-chip">report.pdf</div>
          <div id="composer" contenteditable="true" role="textbox" aria-multiline="true"></div>
          <button id="send" type="submit" aria-label="Send message">Send</button>
        </form>
      </main>
    `;

    const composer = document.querySelector('#composer') as HTMLElement;
    const form = document.querySelector('#composer-form') as HTMLFormElement;
    const button = document.querySelector('#send') as HTMLButtonElement;
    const adapter = {
      containsComposerTarget: vi.fn((target: EventTarget | null) =>
        target instanceof Node ? composer.contains(target) : false,
      ),
      discoverComposer: vi.fn(() => ({
        composer,
        kind: 'contenteditable' as const,
        strategy: 'test',
        fingerprint: 'composer-fingerprint',
        form,
        submitButton: button,
        attachmentCandidates: [
          document.querySelector(
            '[data-testid="attachment-chip"]',
          ) as HTMLElement,
        ],
      })),
      findSubmitButton: vi.fn(() => button),
      getComposerFingerprint: vi.fn(() => 'composer-fingerprint'),
      getComposerText: vi.fn(() => 'Prompt pulito'),
      hasNativeAttachments: vi.fn(() => true),
      submit: vi.fn(),
    };
    const onBlocked = vi.fn();

    const stop = registerSubmitGuard({
      adapter: adapter as never,
      getState: async () => null,
      onBlocked,
      healthCheck: vi.fn().mockResolvedValue(true),
    });

    form.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    await vi.waitFor(() => {
      expect(adapter.submit).toHaveBeenCalledTimes(1);
    });

    expect(onBlocked).not.toHaveBeenCalled();

    stop();
  });

  it('intercepts a click on the send button even when findSubmitButton returns null due to DOM change', async () => {
    document.body.innerHTML = `
      <main>
        <div>
          <div id="composer" contenteditable="true" role="textbox" aria-multiline="true"></div>
          <button id="send" data-testid="send-button" type="button" aria-label="Send message">Send</button>
        </div>
      </main>
    `;

    const composer = document.querySelector('#composer') as HTMLElement;
    const button = document.querySelector('#send') as HTMLButtonElement;
    const adapter = {
      containsComposerTarget: vi.fn((target: EventTarget | null) =>
        target instanceof Node ? composer.contains(target) : false,
      ),
      discoverComposer: vi.fn(() => null),
      // findSubmitButton returns null — simulates discoverComposer() failing due to DOM change
      findSubmitButton: vi.fn(() => null),
      getComposerFingerprint: vi.fn(() => 'composer-a'),
      getComposerText: vi.fn(() => 'Prompt pulito'),
      hasNativeAttachments: vi.fn(() => false),
      submit: vi.fn(),
    };
    const onBlocked = vi.fn();

    const stop = registerSubmitGuard({
      adapter: adapter as never,
      getState: async () => null,
      onBlocked,
      healthCheck: vi.fn().mockResolvedValue(true),
    });

    button.click();
    await vi.waitFor(() => {
      // Clean text with no session state → manual_current → allowed → submit called
      expect(adapter.submit).toHaveBeenCalledTimes(1);
    });

    expect(onBlocked).not.toHaveBeenCalled();
    stop();
  });

  it('blocks send button click via broadened detection when findSubmitButton is null and text looks sensitive', async () => {
    document.body.innerHTML = `
      <main>
        <div>
          <div id="composer" contenteditable="true" role="textbox" aria-multiline="true"></div>
          <button id="send" data-testid="send-button" type="button" aria-label="Send message">Send</button>
        </div>
      </main>
    `;

    const composer = document.querySelector('#composer') as HTMLElement;
    const button = document.querySelector('#send') as HTMLButtonElement;
    const adapter = {
      containsComposerTarget: vi.fn((target: EventTarget | null) =>
        target instanceof Node ? composer.contains(target) : false,
      ),
      discoverComposer: vi.fn(() => null),
      findSubmitButton: vi.fn(() => null),
      getComposerFingerprint: vi.fn(() => 'composer-a'),
      getComposerText: vi.fn(() => 'Contatta user@example.com'),
      hasNativeAttachments: vi.fn(() => false),
      submit: vi.fn(),
    };
    const onBlocked = vi.fn();

    const stop = registerSubmitGuard({
      adapter: adapter as never,
      getState: async () => null,
      onBlocked,
      healthCheck: vi.fn().mockResolvedValue(true),
    });

    button.click();
    await vi.waitFor(() => {
      expect(onBlocked).toHaveBeenCalledWith(
        expect.objectContaining({ state: 'never_sanitized', allowed: false }),
      );
    });

    expect(adapter.submit).not.toHaveBeenCalled();
    stop();
  });

  it('auto-sanitizes typed sensitive text before submit when the hook is provided', async () => {
    document.body.innerHTML = `
      <main>
        <form id="composer-form">
          <div id="composer" contenteditable="true" role="textbox" aria-multiline="true"></div>
          <button id="send" type="submit" aria-label="Send message">Send</button>
        </form>
      </main>
    `;

    const composer = document.querySelector('#composer') as HTMLElement;
    const form = document.querySelector('#composer-form') as HTMLFormElement;
    const button = document.querySelector('#send') as HTMLButtonElement;
    const adapter = {
      containsComposerTarget: vi.fn((target: EventTarget | null) =>
        target instanceof Node ? composer.contains(target) : false,
      ),
      discoverComposer: vi.fn(() => ({
        composer,
        kind: 'contenteditable' as const,
        strategy: 'test',
        fingerprint: 'composer-fingerprint',
        form,
        submitButton: button,
        attachmentCandidates: [],
      })),
      findSubmitButton: vi.fn(() => button),
      getComposerFingerprint: vi.fn(() => 'composer-fingerprint'),
      getComposerText: vi.fn(() => 'Contatta user@example.com'),
      hasNativeAttachments: vi.fn(() => false),
      submit: vi.fn(),
    };
    const onAutoSanitize = vi.fn().mockResolvedValue('submitted');
    const onBlocked = vi.fn();

    const stop = registerSubmitGuard({
      adapter: adapter as never,
      getState: async () => null,
      onAutoSanitize,
      onBlocked,
      healthCheck: vi.fn().mockResolvedValue(true),
    });

    form.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    // Wait for both onAutoSanitize and the subsequent adapter.submit call.
    // adapter.submit is invoked after waitForComposerFlush (2 rAF cycles), so
    // we must wait for it explicitly rather than asserting synchronously.
    await vi.waitFor(() => {
      expect(onAutoSanitize).toHaveBeenCalled();
      expect(adapter.submit).toHaveBeenCalledTimes(1);
    });

    expect(onAutoSanitize).toHaveBeenCalledWith(
      expect.objectContaining({
        currentText: 'Contatta user@example.com',
        verdict: expect.objectContaining({
          state: 'never_sanitized',
        }),
      }),
    );
    expect(onBlocked).not.toHaveBeenCalled();

    stop();
  });
});
