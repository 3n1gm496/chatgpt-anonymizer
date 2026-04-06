import { z } from 'zod';

export const runtimeMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('runtime/get-tab-context'),
  }),
  z.object({
    type: z.literal('runtime/tab-context'),
    tabId: z.number().int().nonnegative(),
    conversationId: z.string().min(1),
  }),
  z.object({
    type: z.literal('runtime/reset-session'),
    tabId: z.number().int().nonnegative(),
    conversationId: z.string().min(1),
    sessionId: z.string().min(1).optional(),
  }),
  z.object({
    type: z.literal('runtime/session-reset'),
    success: z.boolean(),
    sessionId: z.string().nullable(),
  }),
]);
export type RuntimeMessage = z.infer<typeof runtimeMessageSchema>;
