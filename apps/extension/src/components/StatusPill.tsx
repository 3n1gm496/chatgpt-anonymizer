import React from 'react';

type StatusMode =
  | 'idle'
  | 'processing'
  | 'ready'
  | 'blocked'
  | 'error'
  | 'notice';

const LABELS: Record<StatusMode, string> = {
  idle: 'Pronto',
  processing: 'Protezione in corso',
  ready: 'Prompt protetto',
  blocked: 'Controllo richiesto',
  error: 'Attenzione',
  notice: 'Promemoria',
};

const HEADLINES: Record<StatusMode, string> = {
  idle: 'Pronto a proteggere il prossimo incolla.',
  processing: 'Controllo locale in corso.',
  ready: 'Protezione aggiornata.',
  blocked: 'Serve un nuovo passaggio.',
  error: 'La protezione non è riuscita.',
  notice: 'C è una nota utile.',
};

const DEFAULT_MESSAGES: Record<StatusMode, string> = {
  idle: 'Puoi scrivere normalmente oppure incollare testo da pseudonimizzare.',
  processing:
    'Sto elaborando il contenuto in locale, senza inviarlo a servizi esterni.',
  ready: 'Il prompt è stato aggiornato e resta modificabile.',
  blocked:
    'Controlla il testo e rilancia la protezione solo sulla parte nuova.',
  error: 'Qualcosa non è andato come previsto durante la protezione locale.',
  notice: 'C è qualcosa da sapere prima di continuare.',
};

export interface StatusPillProps {
  mode: StatusMode;
  message?: string;
  replacementCount?: number;
}

export function StatusPill({
  mode,
  message,
  replacementCount = 0,
}: StatusPillProps): React.JSX.Element {
  const summary =
    mode === 'ready' && replacementCount > 0
      ? `${replacementCount} elementi protetti nel prompt`
      : HEADLINES[mode];

  return (
    <div
      className={`cga-pill cga-pill--${mode}`}
      aria-live={
        mode === 'blocked' || mode === 'error' ? 'assertive' : 'polite'
      }
    >
      <span className="cga-pill__label">{LABELS[mode]}</span>
      <strong className="cga-pill__headline">{summary}</strong>
      <span className="cga-pill__message">
        {message ?? DEFAULT_MESSAGES[mode]}
      </span>
    </div>
  );
}
