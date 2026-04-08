import { z } from 'zod';

import {
  findingSchema,
  protocolVersionSchema,
  replacementSchema,
  riskSummarySchema,
} from './findings';

const isoDateTimeSchema = z.string().datetime({ offset: true });

export const healthResponseSchema = z.object({
  protocolVersion: protocolVersionSchema,
  status: z.enum(['ok', 'degraded']),
  engineVersion: z.string().min(1),
  bind: z.literal('127.0.0.1'),
  // heuristicsEnabled replaces the previous mlEnabled field.
  // The contextual detector uses regex heuristics, not machine learning.
  heuristicsEnabled: z.boolean(),
  detectors: z.array(z.string().min(1)),
  storage: z.object({
    encrypted: z.boolean(),
    dataDir: z.string().min(1),
  }),
  uptimeSeconds: z.number().nonnegative(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const sanitizeRequestSchema = z.object({
  protocolVersion: protocolVersionSchema,
  conversationId: z.string().min(1),
  sessionId: z.string().min(1).optional(),
  text: z.string().min(1).max(50_000),
  detectedContentType: z.enum(['paste', 'drop', 'manual']).default('paste'),
  exclusions: z.array(z.string().min(1)).default([]),
  options: z
    .object({
      // enableHeuristics replaces enableMl — no ML is involved.
      enableHeuristics: z.boolean().default(true),
      sessionTtlMinutes: z.number().int().positive().max(1_440).optional(),
    })
    .default({ enableHeuristics: true }),
});
export type SanitizeRequest = z.infer<typeof sanitizeRequestSchema>;

export const sanitizeResponseSchema = z.object({
  protocolVersion: protocolVersionSchema,
  sessionId: z.string().min(1),
  sanitizedText: z.string(),
  sanitizedFingerprint: z.string().length(64),
  expiresAt: isoDateTimeSchema,
  findings: z.array(findingSchema),
  replacements: z.array(replacementSchema),
  riskSummary: riskSummarySchema,
});
export type SanitizeResponse = z.infer<typeof sanitizeResponseSchema>;

export const revertRequestSchema = z.object({
  protocolVersion: protocolVersionSchema,
  sessionId: z.string().min(1),
  text: z.string(),
});
export type RevertRequest = z.infer<typeof revertRequestSchema>;

export const rehydrationMatchSchema = z.object({
  placeholder: z.string().min(1),
  originalText: z.string(),
  count: z.number().int().nonnegative(),
});
export type RehydrationMatch = z.infer<typeof rehydrationMatchSchema>;

export const revertResponseSchema = z.object({
  protocolVersion: protocolVersionSchema,
  sessionId: z.string().min(1),
  revertedText: z.string(),
  totalReplacements: z.number().int().nonnegative(),
  replacements: z.array(rehydrationMatchSchema),
});
export type RevertResponse = z.infer<typeof revertResponseSchema>;

// Engine auth token — returned by GET /engine-token
export const engineTokenResponseSchema = z.object({
  token: z.string().min(1),
});
export type EngineTokenResponse = z.infer<typeof engineTokenResponseSchema>;
