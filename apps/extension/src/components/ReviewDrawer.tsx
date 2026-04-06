import React from 'react';

import type {
  Finding,
  ReplacementDecision,
} from '@chatgpt-anonymizer/contracts';

import { summarizeConfidence } from '../lib/confidence';

export interface ReviewDrawerProps {
  open: boolean;
  findings: Finding[];
  decisions: Record<string, ReplacementDecision>;
  onDecisionChange: (findingId: string, decision: ReplacementDecision) => void;
  onApply: () => void;
  onClose: () => void;
}

export function ReviewDrawer({
  open,
  findings,
  decisions,
  onDecisionChange,
  onApply,
  onClose,
}: ReviewDrawerProps): React.JSX.Element | null {
  if (!open) {
    return null;
  }

  return (
    <aside className="cga-review-drawer" aria-live="polite">
      <header className="cga-review-drawer__header">
        <div>
          <h2>Controllo manuale mirato</h2>
          <p>{summarizeConfidence(findings)}</p>
        </div>
        <button type="button" onClick={onClose}>
          Non ora
        </button>
      </header>
      <div className="cga-review-drawer__list">
        {findings.map((finding) => (
          <article className="cga-review-card" key={finding.id}>
            <div className="cga-review-card__header">
              <strong>{finding.entityType}</strong>
              <span>{finding.detector}</span>
            </div>
            <p className="cga-review-card__placeholder">
              {finding.originalText} → {finding.placeholder}
            </p>
            <p>{finding.rationale ?? 'Nessuna nota aggiuntiva.'}</p>
            <div className="cga-review-card__actions">
              <button
                type="button"
                className={
                  decisions[finding.id] === 'accept' ? 'is-active' : undefined
                }
                onClick={() => onDecisionChange(finding.id, 'accept')}
              >
                Mantieni anonimo
              </button>
              <button
                type="button"
                className={
                  decisions[finding.id] === 'exclude' ? 'is-active' : undefined
                }
                onClick={() => onDecisionChange(finding.id, 'exclude')}
              >
                Lascia originale
              </button>
            </div>
          </article>
        ))}
      </div>
      <footer className="cga-review-drawer__footer">
        <button type="button" onClick={onApply}>
          Applica le scelte
        </button>
      </footer>
    </aside>
  );
}
