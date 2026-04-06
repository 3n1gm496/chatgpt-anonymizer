import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import type { HealthResponse } from '@chatgpt-anonymizer/contracts';

import { MappingSessionCard } from '../../components/MappingSessionCard';
import { useChatGPTPage } from '../../hooks/useChatGPTPage';
import { useSanitization } from '../../hooks/useSanitization';
import {
  buildSessionScope,
  clearSessionState,
} from '../../services/sessionStore';
import {
  health,
  resetSession,
  LocalEngineUnavailableError,
} from '../../services/localEngineClient';
import { getSettings } from '../../services/settingsStore';

function PopupApp(): React.JSX.Element {
  const page = useChatGPTPage();
  const sessionState = useSanitization(page.tabId, page.conversationId);
  const [engineStatus, setEngineStatus] = useState<{
    healthy: boolean;
    lastError: string | null;
    healthPayload: HealthResponse | null;
  }>({
    healthy: false,
    lastError: null,
    healthPayload: null,
  });
  const [debugMode, setDebugMode] = useState(false);
  const [engineBaseUrl, setEngineBaseUrl] = useState('http://127.0.0.1:8765');
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const settings = await getSettings();
      if (active) {
        setDebugMode(settings.debugMode);
        setEngineBaseUrl(settings.engineBaseUrl);
      }

      try {
        const healthPayload = await health(settings.engineBaseUrl);
        if (active) {
          setEngineStatus({
            healthy: true,
            lastError: null,
            healthPayload,
          });
        }
      } catch (error) {
        if (active) {
          const message =
            error instanceof LocalEngineUnavailableError
              ? error.message
              : 'Stato motore locale non disponibile.';
          setEngineStatus({
            healthy: false,
            lastError: message,
            healthPayload: null,
          });
        }
      }
    };
    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, 3000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const handleReset = async () => {
    if (page.tabId === null || !page.conversationId) {
      return;
    }

    const scope = buildSessionScope(page.tabId, page.conversationId);
    await resetSession({
      protocolVersion: 'v1',
      sessionId: sessionState?.sessionId,
      conversationId: scope.engineConversationId,
    }).catch(() => undefined);

    await clearSessionState(scope.sessionKey);
    setResetMessage('Sessione locale azzerata per la tab corrente.');
    window.setTimeout(() => setResetMessage(null), 1800);
  };

  return (
    <main
      style={{
        width: 360,
        minHeight: 460,
        padding: 20,
        background:
          'radial-gradient(circle at top right, rgba(13,89,101,0.16), transparent 30%), linear-gradient(180deg, #f8f4ec, #fffdfa)',
        color: '#17313a',
        fontFamily: '"IBM Plex Sans", "Segoe UI", sans-serif',
      }}
    >
      <h1 style={{ marginTop: 0, marginBottom: 8 }}>ChatGPT Anonymizer</h1>
      <p style={{ marginTop: 0, color: '#395960' }}>
        Protezione locale del testo prima dell invio a ChatGPT, con controlli
        automatici e UI discreta.
      </p>
      <MappingSessionCard
        state={sessionState}
        engineBaseUrl={engineBaseUrl}
        engineStatus={engineStatus}
        debugMode={debugMode}
        resetMessage={resetMessage}
        onReset={handleReset}
      />
      <section style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Pagina aperta</h2>
        <p style={{ margin: 0 }}>
          {page.isChatGPT
            ? 'ChatGPT è stato rilevato correttamente in questa tab.'
            : 'Questa tab non è supportata: apri ChatGPT per usare la protezione locale.'}
        </p>
        <p style={{ marginTop: 6, marginBottom: 0, color: '#36565b' }}>
          Conversazione attiva: {page.conversationId ?? 'nessuna'}
        </p>
      </section>
      <section
        style={{
          marginTop: 16,
          padding: 14,
          borderRadius: 18,
          background: 'rgba(255,255,255,0.7)',
          border: '1px solid rgba(9,73,86,0.1)',
        }}
      >
        <h2 style={{ fontSize: 16, marginTop: 0, marginBottom: 8 }}>
          In breve
        </h2>
        <p style={{ marginTop: 0, marginBottom: 6, color: '#36565b' }}>
          Incolla o trascina testo nel prompt e l estensione lo protegge in
          locale prima dell invio. Se nel paste/drop ci sono file testuali
          piccoli, prova a leggerli e proteggere anche quelli.
        </p>
        <p style={{ marginTop: 0, marginBottom: 0, color: '#36565b' }}>
          Anche quando il testo viene digitato a mano, l estensione prova a
          proteggerlo automaticamente prima dell invio. Se carichi file o
          allegati direttamente in ChatGPT, il loro contenuto non viene ancora
          anonimizzato automaticamente.
        </p>
      </section>
    </main>
  );
}

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(<PopupApp />);
}

export default PopupApp;
