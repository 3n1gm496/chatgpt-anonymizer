import { useEffect, useState } from 'react';

export interface ActiveChatGPTPage {
  tabId: number | null;
  conversationId: string | null;
  url: string | null;
  isChatGPT: boolean;
}

export function deriveConversationIdFromUrl(url: string): string {
  const path = new URL(url).pathname;
  const match = path.match(/\/c\/([^/?#]+)/);
  return match ? `chat:${match[1]}` : 'chat:new';
}

const extensionGlobal = globalThis as typeof globalThis & {
  browser?: {
    tabs?: {
      query: (query: {
        active: boolean;
        currentWindow: boolean;
      }) => Promise<Array<{ id?: number; url?: string }>>;
    };
  };
  chrome?: {
    tabs?: {
      query: (
        query: { active: boolean; currentWindow: boolean },
        callback: (tabs: Array<{ id?: number; url?: string }>) => void,
      ) => void;
    };
  };
};

async function queryActiveTab(): Promise<ActiveChatGPTPage> {
  const tabsApi = extensionGlobal.browser?.tabs;
  if (tabsApi?.query) {
    const tabs = await tabsApi.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];
    const url = activeTab?.url ?? null;
    const isChatGPT = Boolean(
      url?.includes('chatgpt.com') || url?.includes('chat.openai.com'),
    );
    return {
      tabId: activeTab?.id ?? null,
      conversationId:
        url && isChatGPT ? deriveConversationIdFromUrl(url) : null,
      url,
      isChatGPT,
    };
  }

  if (!extensionGlobal.chrome?.tabs?.query) {
    return {
      tabId: null,
      conversationId: null,
      url: null,
      isChatGPT: false,
    };
  }

  const tabs = await new Promise<Array<{ id?: number; url?: string }>>(
    (resolve) => {
      extensionGlobal.chrome?.tabs?.query(
        { active: true, currentWindow: true },
        resolve,
      );
    },
  );
  const activeTab = tabs[0];
  const url = activeTab?.url ?? null;
  const isChatGPT = Boolean(
    url?.includes('chatgpt.com') || url?.includes('chat.openai.com'),
  );
  return {
    tabId: activeTab?.id ?? null,
    conversationId: url && isChatGPT ? deriveConversationIdFromUrl(url) : null,
    url,
    isChatGPT,
  };
}

export function useChatGPTPage(): ActiveChatGPTPage {
  const [state, setState] = useState<ActiveChatGPTPage>({
    tabId: null,
    conversationId: null,
    url: null,
    isChatGPT: false,
  });

  useEffect(() => {
    let isMounted = true;
    const refresh = async () => {
      const nextState = await queryActiveTab();
      if (isMounted) {
        setState(nextState);
      }
    };
    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, 1500);
    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, []);

  return state;
}
