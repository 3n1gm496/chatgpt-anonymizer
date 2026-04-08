import React from 'react';

import type { HealthResponse } from '@chatgpt-anonymizer/contracts';

import type { SanitizationState } from '../services/sessionStore';

export interface MappingSessionCardProps {
  state: SanitizationState | null;
  engineBaseUrl: string;
  engineStatus: {
    healthy: boolean;
    lastError: string | null;
    healthPayload: HealthResponse | null;
  };
  debugMode: boolean;
  resetMessage: string | null;
  onReset: () => void;
}

export function MappingSessionCard({
  state,
  engineBaseUrl,
  engineStatus,
  debugMode,
  resetMessage,
  onReset,
}: MappingSessionCardProps): React.JSX.Element {
  const engineLabel = engineStatus.healthy
    ? 'Motore locale pronto'
    : 'Motore locale non raggiungibile';
  const sessionLabel = state?.sessionId
    ? 'Prompt già protetto in questa tab'
    : 'Nessuna protezione attiva su questa tab';
  const replacementsLabel =
    state?.replacementCount && state.replacementCount > 0
      ? `${state.replacementCount} sostituzioni applicate`
      : 'Nessuna sostituzione ancora applicata';

  return (
    <section
      style={{
        borderRadius: 24,
        padding: 18,
        background:
          'linear-gradient(145deg, rgba(9,73,86,0.12), rgba(255,251,245,0.96))',
        border: '1px solid rgba(9,73,86,0.12)',
        boxShadow: '0 14px 30px rgba(17, 42, 48, 0.08)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Situazione attuale</h2>
          <p style={{ marginTop: 8, marginBottom: 0, color: '#36565b' }}>
            Qui controlli se il motore locale risponde e se il prompt aperto è
            già stato protetto.
          </p>
        </div>
        <span
          style={{
            flexShrink: 0,
            borderRadius: 999,
            padding: '6px 10px',
            fontSize: 12,
            fontWeight: 700,
            background: engineStatus.healthy
              ? 'rgba(22, 101, 52, 0.12)'
              : 'rgba(180, 35, 24, 0.12)',
            color: engineStatus.healthy ? '#166534' : '#8a2a21',
          }}
        >
          {engineStatus.healthy ? 'Pronto' : 'Da controllare'}
        </span>
      </div>
      <div
        style={{
          marginTop: 16,
          display: 'grid',
          gap: 10,
        }}
      >
        <div>
          <strong style={{ display: 'block' }}>{engineLabel}</strong>
          <span style={{ color: '#36565b' }}>
            {engineStatus.healthy
              ? `Versione ${engineStatus.healthPayload?.engineVersion ?? 'n/d'} su ${engineBaseUrl}`
              : (engineStatus.lastError ??
                'Non riesco a raggiungere il servizio locale.')}
          </span>
        </div>
        <div>
          <strong style={{ display: 'block' }}>{sessionLabel}</strong>
          <span style={{ color: '#36565b' }}>
            {state?.engineConversationId ??
              'Nessuna conversazione ChatGPT associata.'}
          </span>
        </div>
        <div>
          <strong style={{ display: 'block' }}>{replacementsLabel}</strong>
          <span style={{ color: '#36565b' }}>
            {state?.lowConfidenceCount ?? 0} rilevazioni sono state gestite in
            modo prudente, sempre in automatico e senza passaggi manuali.
          </span>
        </div>
        <div>
          <strong style={{ display: 'block' }}>Interfaccia</strong>
          <span style={{ color: '#36565b' }}>
            Overlay discreto e temporaneo, senza drawer o conferme manuali nel
            flusso normale.
          </span>
        </div>
        <div>
          <strong style={{ display: 'block' }}>Copertura attuale</strong>
          <span style={{ color: '#36565b' }}>
            Testo incollato o trascinato nel prompt: sì. File testuali piccoli
            letti via paste/drop: sì. Allegati caricati direttamente in ChatGPT:
            non ancora pseudonimizzati automaticamente.
          </span>
        </div>
        <div>
          <strong style={{ display: 'block' }}>Sessione locale</strong>
          <span style={{ color: '#36565b' }}>
            ID {state?.sessionId ?? 'non attivo'} · scadenza{' '}
            {state?.expiresAt ?? 'non disponibile'}
          </span>
        </div>
      </div>
      {debugMode ? (
        <p style={{ marginTop: 14, marginBottom: 0, color: '#36565b' }}>
          Debug · revision {state?.revision ?? 0} · fingerprint composer{' '}
          {state?.composerFingerprint ?? 'n/d'}
        </p>
      ) : null}
      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          marginTop: 18,
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={onReset}
          style={{
            borderRadius: 999,
            border: '1px solid rgba(9,73,86,0.16)',
            padding: '10px 14px',
            background: '#ffffff',
            color: '#17313a',
            font: '600 13px/1 "IBM Plex Sans", "Segoe UI", sans-serif',
            cursor: 'pointer',
          }}
        >
          Azzera la sessione di questa tab
        </button>
        {resetMessage ? (
          <span style={{ color: '#36565b' }}>{resetMessage}</span>
        ) : null}
      </div>
    </section>
  );
}
