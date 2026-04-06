import type { Finding } from '@chatgpt-anonymizer/contracts';

export function requiresReview(finding: Finding): boolean {
  return finding.reviewRecommended;
}

export function countLowConfidence(findings: Finding[]): number {
  return findings.filter((finding) => finding.confidenceLevel === 'low').length;
}

export function summarizeConfidence(findings: Finding[]): string {
  const total = findings.length;
  if (total === 1) {
    return 'Solo 1 punto è abbastanza ambiguo da meritare un controllo manuale.';
  }
  if (total > 1) {
    return `Solo ${total} punti sono abbastanza ambigui da meritare un controllo manuale.`;
  }
  return 'Nessun caso richiede una review manuale.';
}
