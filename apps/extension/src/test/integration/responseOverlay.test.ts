import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/localEngineClient', () => ({
  revert: vi.fn(),
}));

const { revert } = await import('../../services/localEngineClient');
const { registerResponseOverlay } =
  await import('../../chatgpt/responseOverlay');

describe('responseOverlay', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('supports repeated toggles and re-applies rehydration after subtree rerender', async () => {
    document.body.innerHTML = `
      <main>
        <article data-message-author-role="assistant">
          <div id="response-body">Hello [EMAIL_001]</div>
        </article>
      </main>
    `;

    const article = document.querySelector<HTMLElement>('article')!;
    const responseBody = document.getElementById('response-body')!;
    vi.mocked(revert).mockResolvedValue({
      protocolVersion: 'v1',
      sessionId: 'session-1',
      revertedText: 'Hello user@example.com',
      totalReplacements: 1,
      replacements: [
        {
          placeholder: '[EMAIL_001]',
          originalText: 'user@example.com',
          count: 1,
        },
      ],
    });

    const stop = registerResponseOverlay({
      adapter: {
        getAssistantResponses: () => [article],
      },
      getState: async () =>
        ({
          sessionKey: 'scope',
          tabId: 1,
          conversationId: 'chat:new',
          engineConversationId: 'tab:1:chat:new',
          sessionId: 'session-1',
          replacementCount: 1,
          lowConfidenceCount: 0,
          reviewPending: false,
          reviewDecisions: {},
          engineHealthy: true,
          revision: 1,
        }) as const,
      enabled: async () => true,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    article.querySelector<HTMLButtonElement>('.cga-response-toggle')?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(responseBody.textContent).toContain('user@example.com');

    responseBody.append(document.createTextNode(' and [EMAIL_001] again'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(responseBody.textContent).toContain('and user@example.com again');

    article.querySelector<HTMLButtonElement>('.cga-response-toggle')?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(responseBody.textContent).toContain('Hello [EMAIL_001]');

    article.querySelector<HTMLButtonElement>('.cga-response-toggle')?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(responseBody.textContent).toContain('Hello user@example.com');

    stop();
  });
});
