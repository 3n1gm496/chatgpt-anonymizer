import { describe, expect, it } from 'vitest';

import {
  applyReviewSessionDraft,
  createReviewSessionDraft,
  updateReviewDecision,
} from '../../services/reviewSession';

describe('reviewSession', () => {
  it('does not create a manual review draft for low-confidence findings unless they are explicitly recommended', () => {
    const draft = createReviewSessionDraft({
      sessionKey: 'scope',
      originalText: 'Phone +39 347 555 0101',
      composerTextBeforeSanitize: '',
      sanitizedText: 'Phone [PHONE_001]',
      findings: [
        {
          id: 'finding-phone',
          entityType: 'PHONE',
          detector: 'regex:phone',
          confidence: 0.72,
          confidenceLevel: 'low',
          start: 6,
          end: 22,
          originalText: '+39 347 555 0101',
          placeholder: '[PHONE_001]',
          reviewRecommended: false,
        },
      ],
      replacements: [
        {
          findingId: 'finding-phone',
          entityType: 'PHONE',
          start: 6,
          end: 22,
          originalText: '+39 347 555 0101',
          placeholder: '[PHONE_001]',
          confidence: 0.72,
          applied: true,
        },
      ],
    });

    expect(draft).toBeNull();
  });

  it('applies review decisions idempotently from the original text baseline', () => {
    const draft = createReviewSessionDraft({
      sessionKey: 'scope',
      originalText: 'Email user@example.com Phone +39 347 555 0101',
      composerTextBeforeSanitize: 'Premessa',
      sanitizedText: 'Email [EMAIL_001] Phone [PHONE_001]',
      findings: [
        {
          id: 'finding-email',
          entityType: 'EMAIL',
          detector: 'regex:email',
          confidence: 0.95,
          confidenceLevel: 'high',
          start: 6,
          end: 22,
          originalText: 'user@example.com',
          placeholder: '[EMAIL_001]',
          reviewRecommended: false,
        },
        {
          id: 'finding-phone',
          entityType: 'PHONE',
          detector: 'regex:phone',
          confidence: 0.7,
          confidenceLevel: 'low',
          start: 29,
          end: 45,
          originalText: '+39 347 555 0101',
          placeholder: '[PHONE_001]',
          reviewRecommended: true,
        },
      ],
      replacements: [
        {
          findingId: 'finding-email',
          entityType: 'EMAIL',
          start: 6,
          end: 22,
          originalText: 'user@example.com',
          placeholder: '[EMAIL_001]',
          confidence: 0.95,
          applied: true,
        },
        {
          findingId: 'finding-phone',
          entityType: 'PHONE',
          start: 29,
          end: 45,
          originalText: '+39 347 555 0101',
          placeholder: '[PHONE_001]',
          confidence: 0.7,
          applied: true,
        },
      ],
      baseReplacementCount: 1,
      baseLowConfidenceCount: 0,
      baseReviewPending: false,
    });

    expect(draft).not.toBeNull();
    const updated = updateReviewDecision(draft!, 'finding-phone', 'exclude');
    const once = applyReviewSessionDraft(
      updated,
      'Premessa\n\nEmail [EMAIL_001] Phone [PHONE_001]\n\nNota finale',
    );
    const twice = applyReviewSessionDraft(
      updated,
      'Premessa\n\nEmail [EMAIL_001] Phone [PHONE_001]\n\nNota finale',
    );

    expect(once.sanitizedText).toContain('[EMAIL_001]');
    expect(once.sanitizedText).toContain('+39 347 555 0101');
    expect(once.fullComposerText).toContain('Premessa');
    expect(once.fullComposerText).toContain('Nota finale');
    expect(once.replacementCount).toBe(2);
    expect(once).toEqual(twice);
  });
});
