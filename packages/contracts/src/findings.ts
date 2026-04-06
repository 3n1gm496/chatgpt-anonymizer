import { z } from 'zod';

export const protocolVersionSchema = z.literal('v1');
export type ProtocolVersion = z.infer<typeof protocolVersionSchema>;

export const entityTypeSchema = z.enum([
  'EMAIL',
  'IPV4',
  'IPV6',
  'URL',
  'HOSTNAME',
  'PERSON',
  'USERNAME',
  'PHONE',
  'CODICE_FISCALE',
  'PARTITA_IVA',
  'CUSTOM',
]);
export type EntityType = z.infer<typeof entityTypeSchema>;

export const confidenceLevelSchema = z.enum(['high', 'medium', 'low']);
export type ConfidenceLevel = z.infer<typeof confidenceLevelSchema>;

export const replacementDecisionSchema = z.enum(['accept', 'exclude']);
export type ReplacementDecision = z.infer<typeof replacementDecisionSchema>;

export const findingSchema = z.object({
  id: z.string().min(1),
  entityType: entityTypeSchema,
  detector: z.string().min(1),
  confidence: z.number().min(0).max(1),
  confidenceLevel: confidenceLevelSchema,
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  originalText: z.string(),
  placeholder: z.string().min(1),
  reviewRecommended: z.boolean(),
  rationale: z.string().optional(),
});
export type Finding = z.infer<typeof findingSchema>;

export const replacementSchema = z.object({
  findingId: z.string().min(1),
  entityType: entityTypeSchema,
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  originalText: z.string(),
  placeholder: z.string().min(1),
  confidence: z.number().min(0).max(1),
  applied: z.boolean(),
});
export type Replacement = z.infer<typeof replacementSchema>;

export const entityCountMapSchema = z.record(
  z.string(),
  z.number().int().nonnegative(),
);
export type EntityCountMap = z.infer<typeof entityCountMapSchema>;

export const riskSummarySchema = z.object({
  score: z.number().min(0).max(100),
  level: z.enum(['low', 'medium', 'high']),
  findingsCount: z.number().int().nonnegative(),
  replacementCount: z.number().int().nonnegative(),
  lowConfidenceCount: z.number().int().nonnegative(),
  ambiguousCount: z.number().int().nonnegative(),
  reviewRequired: z.boolean(),
  entityCounts: entityCountMapSchema,
});
export type RiskSummary = z.infer<typeof riskSummarySchema>;

export function confidenceLevelFromScore(score: number): ConfidenceLevel {
  if (score >= 0.9) {
    return 'high';
  }

  if (score >= 0.75) {
    return 'medium';
  }

  return 'low';
}
