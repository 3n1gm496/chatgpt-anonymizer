import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import type { HealthResponse } from '@chatgpt-anonymizer/contracts';

import {
  getSettings,
  saveSettings,
  type ExtensionSettings,
} from '../../services/settingsStore';
import {
  health,
  LocalEngineUnavailableError,
} from '../../services/localEngineClient';

function OptionsApp(): React.JSX.Element {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [engineStatus, setEngineStatus] = useState<{
    loading: boolean;
    payload: HealthResponse | null;
    error: string | null;
  }>({
    loading: true,
    payload: null,
    error: null,
  });

  useEffect(() => {
    let active = true;

    const refresh = async () => {
      const nextSettings = await getSettings();
      if (active) {
        setSettings(nextSettings);
      }

      try {
        const healthPayload = await health(nextSettings.engineBaseUrl);
        if (!active) {
          return;
        }
        setEngineStatus({
          loading: false,
          payload: healthPayload,
          error: null,
        });
      } catch (error) {
        if (!active) {
          return;
        }
        setEngineStatus({
          loading: false,
          payload: null,
          error:
            error instanceof Error
              ? error.message
              : 'Stato engine non disponibile.',
        });
      }
    };

    void refresh();
    return () => {
      active = false;
    };
  }, []);

  if (!settings) {
    return <main style={{ padding: 24 }}>Caricamento impostazioni...</main>;
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: 32,
        background:
          'linear-gradient(180deg, rgba(247,243,234,1), rgba(255,255,255,1))',
        color: '#17313a',
        fontFamily: '"IBM Plex Sans", "Segoe UI", sans-serif',
      }}
    >
      <h1>Impostazioni</h1>
      <p>
        Configura il bridge localhost e il comportamento dell estensione,
        mantenendo la UI il più discreta possibile.
      </p>
      <section
        style={{
          marginBottom: 24,
          padding: 16,
          borderRadius: 16,
          border: '1px solid rgba(13, 89, 101, 0.16)',
          background: 'rgba(255,255,255,0.82)',
        }}
      >
        <h2 style={{ marginTop: 0 }}>Stato local engine</h2>
        <p style={{ marginTop: 0 }}>
          {engineStatus.loading
            ? 'Verifica in corso...'
            : engineStatus.payload
              ? `Raggiungibile su ${engineStatus.payload.bind}:${
                  new URL(settings.engineBaseUrl).port
                }`
              : engineStatus.error}
        </p>
        {engineStatus.payload ? (
          <>
            <p style={{ marginTop: 0, marginBottom: 6 }}>
              Versione: {engineStatus.payload.engineVersion}
            </p>
            <p style={{ marginTop: 0, marginBottom: 0 }}>
              Storage cifrato:{' '}
              {engineStatus.payload.storage.encrypted ? 'si' : 'no'}
            </p>
          </>
        ) : null}
      </section>
      <label style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
        <span>Base URL local engine</span>
        <input
          value={settings.engineBaseUrl}
          onChange={(event) =>
            setSettings((current) =>
              current
                ? { ...current, engineBaseUrl: event.target.value }
                : current,
            )
          }
        />
        <small>
          Solo `http://127.0.0.1:&lt;porta&gt;` e consentito in questo repo.
        </small>
      </label>
      <label style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
        <span>TTL sessione (minuti)</span>
        <input
          type="number"
          min={5}
          max={240}
          value={settings.sessionTtlMinutes}
          onChange={(event) =>
            setSettings((current) =>
              current
                ? {
                    ...current,
                    sessionTtlMinutes: Number(event.target.value),
                  }
                : current,
            )
          }
        />
      </label>
      <label
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <input
          type="checkbox"
          checked={settings.enableResponseRehydration}
          onChange={(event) =>
            setSettings((current) =>
              current
                ? {
                    ...current,
                    enableResponseRehydration: event.target.checked,
                  }
                : current,
            )
          }
        />
        <span>Abilita reidratazione locale delle risposte</span>
      </label>
      <label
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <input
          type="checkbox"
          checked={settings.debugMode}
          onChange={(event) =>
            setSettings((current) =>
              current
                ? {
                    ...current,
                    debugMode: event.target.checked,
                  }
                : current,
            )
          }
        />
        <span>Abilita diagnostica locale estesa nell estensione</span>
      </label>
      <button
        type="button"
        onClick={() => {
          setSaveError(null);
          void saveSettings(settings)
            .then(async (nextSettings) => {
              setSettings(nextSettings);
              setSaved(true);
              window.setTimeout(() => setSaved(false), 1400);
              try {
                const payload = await health(nextSettings.engineBaseUrl);
                setEngineStatus({
                  loading: false,
                  payload,
                  error: null,
                });
              } catch (error) {
                setEngineStatus({
                  loading: false,
                  payload: null,
                  error:
                    error instanceof LocalEngineUnavailableError
                      ? error.message
                      : 'Stato engine non disponibile.',
                });
              }
            })
            .catch((error) => {
              setSaveError(
                error instanceof Error
                  ? error.message
                  : 'Impossibile salvare le impostazioni.',
              );
            });
        }}
      >
        Salva
      </button>
      {saved ? <p>Impostazioni salvate.</p> : null}
      {saveError ? <p style={{ color: '#8a2a21' }}>{saveError}</p> : null}
    </main>
  );
}

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(<OptionsApp />);
}

export default OptionsApp;
