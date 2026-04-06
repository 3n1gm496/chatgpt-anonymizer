import { runtimeMessageSchema } from '@chatgpt-anonymizer/contracts';

import { deriveConversationIdFromUrl } from '../hooks/useChatGPTPage';

const extensionGlobal = globalThis as typeof globalThis & {
  browser?: {
    runtime?: {
      onMessage?: {
        addListener: (
          callback: (
            message: unknown,
            sender: { tab?: { id?: number; url?: string } },
          ) => unknown,
        ) => void;
      };
    };
  };
  chrome?: typeof chrome;
};

export default defineBackground(() => {
  const runtime =
    extensionGlobal.browser?.runtime ?? extensionGlobal.chrome?.runtime;
  runtime?.onMessage?.addListener((message, sender) => {
    const parsed = runtimeMessageSchema.safeParse(message);
    if (!parsed.success) {
      return undefined;
    }

    if (parsed.data.type === 'runtime/get-tab-context') {
      const url = sender.tab?.url ?? 'https://chatgpt.com/';
      return {
        type: 'runtime/tab-context',
        tabId: sender.tab?.id ?? 0,
        conversationId: deriveConversationIdFromUrl(url),
      };
    }

    if (parsed.data.type === 'runtime/reset-session') {
      return {
        type: 'runtime/session-reset',
        success: true,
        sessionId: parsed.data.sessionId ?? null,
      };
    }

    return undefined;
  });
});
