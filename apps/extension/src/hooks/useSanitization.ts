import { useEffect, useState } from 'react';

import {
  buildSessionKey,
  getSessionState,
  type SanitizationState,
} from '../services/sessionStore';

export function useSanitization(
  tabId: number | null,
  conversationId: string | null,
): SanitizationState | null {
  const [state, setState] = useState<SanitizationState | null>(null);

  useEffect(() => {
    if (tabId === null || !conversationId) {
      setState(null);
      return;
    }

    let active = true;
    const sessionKey = buildSessionKey(tabId, conversationId);
    const refresh = async () => {
      const nextState = await getSessionState(sessionKey);
      if (active) {
        setState(nextState);
      }
    };

    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, 1200);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [conversationId, tabId]);

  return state;
}
