import type {
  Finding,
  Replacement,
  ReplacementDecision,
} from '@chatgpt-anonymizer/contracts';

import { countLowConfidence, requiresReview } from '../lib/confidence';
import { mergeComposerText } from '../lib/richText';

export interface ReviewSessionDraft {
  sessionKey: string;
  originalText: string;
  composerTextBeforeSanitize: string;
  sanitizedText: string;
  findings: Finding[];
  replacements: Replacement[];
  decisions: Record<string, ReplacementDecision>;
  baseReplacementCount: number;
  baseLowConfidenceCount: number;
  baseReviewPending: boolean;
}

export interface AppliedReviewResult {
  sanitizedText: string;
  fullComposerText: string;
  replacementCount: number;
  lowConfidenceCount: number;
  reviewPending: boolean;
  decisions: Record<string, ReplacementDecision>;
}

function buildDefaultDecisions(
  findings: Finding[],
  persisted?: Record<string, ReplacementDecision>,
): Record<string, ReplacementDecision> {
  const next: Record<string, ReplacementDecision> = {};
  for (const finding of findings) {
    next[finding.id] = persisted?.[finding.id] ?? 'accept';
  }
  return next;
}

export function createReviewSessionDraft(input: {
  sessionKey: string;
  originalText: string;
  composerTextBeforeSanitize: string;
  sanitizedText: string;
  findings: Finding[];
  replacements: Replacement[];
  baseReplacementCount?: number;
  baseLowConfidenceCount?: number;
  baseReviewPending?: boolean;
  persistedDecisions?: Record<string, ReplacementDecision>;
}): ReviewSessionDraft | null {
  const reviewableFindings = input.findings.filter((finding) =>
    requiresReview(finding),
  );
  if (reviewableFindings.length === 0) {
    return null;
  }

  return {
    sessionKey: input.sessionKey,
    originalText: input.originalText,
    composerTextBeforeSanitize: input.composerTextBeforeSanitize,
    sanitizedText: input.sanitizedText,
    findings: reviewableFindings,
    replacements: input.replacements,
    decisions: buildDefaultDecisions(
      reviewableFindings,
      input.persistedDecisions,
    ),
    baseReplacementCount: input.baseReplacementCount ?? 0,
    baseLowConfidenceCount: input.baseLowConfidenceCount ?? 0,
    baseReviewPending: input.baseReviewPending ?? false,
  };
}

export function updateReviewDecision(
  draft: ReviewSessionDraft,
  findingId: string,
  decision: ReplacementDecision,
): ReviewSessionDraft {
  return {
    ...draft,
    decisions: {
      ...draft.decisions,
      [findingId]: decision,
    },
  };
}

export function applyReviewSessionDraft(
  draft: ReviewSessionDraft,
  currentComposerText = mergeComposerText(
    draft.composerTextBeforeSanitize,
    draft.sanitizedText,
  ),
): AppliedReviewResult {
  let sanitizedText = draft.originalText;
  for (const replacement of [...draft.replacements].sort(
    (left, right) => right.start - left.start,
  )) {
    if (draft.decisions[replacement.findingId] === 'exclude') {
      continue;
    }

    sanitizedText =
      sanitizedText.slice(0, replacement.start) +
      replacement.placeholder +
      sanitizedText.slice(replacement.end);
  }

  const replacementCount = draft.replacements.filter(
    (replacement) => draft.decisions[replacement.findingId] !== 'exclude',
  ).length;
  const currentAcceptedText = mergeComposerText(
    draft.composerTextBeforeSanitize,
    draft.sanitizedText,
  );
  const reviewedComposerText = mergeComposerText(
    draft.composerTextBeforeSanitize,
    sanitizedText,
  );
  const currentAcceptedIndex = currentComposerText.indexOf(currentAcceptedText);
  const fullComposerText =
    currentAcceptedIndex >= 0
      ? `${currentComposerText.slice(0, currentAcceptedIndex)}${reviewedComposerText}${currentComposerText.slice(
          currentAcceptedIndex + currentAcceptedText.length,
        )}`
      : reviewedComposerText;

  return {
    sanitizedText,
    fullComposerText,
    replacementCount: draft.baseReplacementCount + replacementCount,
    lowConfidenceCount:
      draft.baseLowConfidenceCount +
      countLowConfidence(
        draft.findings.filter(
          (finding) => draft.decisions[finding.id] !== 'exclude',
        ),
      ),
    reviewPending: false,
    decisions: { ...draft.decisions },
  };
}
