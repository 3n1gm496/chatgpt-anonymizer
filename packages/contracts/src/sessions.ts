import { z } from 'zod';

import { protocolVersionSchema } from './findings';

const isoDateTimeSchema = z.string().datetime({ offset: true });

export const sessionSummarySchema = z.object({
  protocolVersion: protocolVersionSchema,
  sessionId: z.string().min(1),
  conversationId: z.string().min(1),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
  mappingCount: z.number().int().nonnegative(),
  replacementCount: z.number().int().nonnegative(),
  lowConfidenceCount: z.number().int().nonnegative(),
  reviewPending: z.boolean(),
});
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

export const resetSessionRequestSchema = z
  .object({
    protocolVersion: protocolVersionSchema,
    sessionId: z.string().min(1).optional(),
    conversationId: z.string().min(1).optional(),
  })
  .refine((value) => Boolean(value.sessionId || value.conversationId), {
    message: 'Either sessionId or conversationId is required',
  });
export type ResetSessionRequest = z.infer<typeof resetSessionRequestSchema>;

export const resetSessionResponseSchema = z.object({
  protocolVersion: protocolVersionSchema,
  reset: z.boolean(),
  sessionId: z.string().nullable(),
  conversationId: z.string().nullable(),
  clearedMappings: z.number().int().nonnegative(),
});
export type ResetSessionResponse = z.infer<typeof resetSessionResponseSchema>;
