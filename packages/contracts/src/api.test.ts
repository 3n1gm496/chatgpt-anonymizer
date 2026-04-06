import { describe, expect, it } from 'vitest';

import {
  healthResponseSchema,
  revertResponseSchema,
  runtimeMessageSchema,
  sanitizeResponseSchema,
  sessionSummarySchema,
} from './index';

describe('contracts', () => {
  it('accepts a valid health response payload', () => {
    const payload = {
      protocolVersion: 'v1',
      status: 'ok',
      engineVersion: '0.1.0',
      bind: '127.0.0.1',
      mlEnabled: false,
      detectors: ['regex', 'dictionary'],
      storage: {
        encrypted: true,
        dataDir: 'services/local-engine/.engine-state',
      },
      uptimeSeconds: 12.4,
    };

    expect(healthResponseSchema.parse(payload)).toEqual(payload);
  });

  it('accepts a valid sanitize response payload', () => {
    const payload = {
      protocolVersion: 'v1',
      sessionId: 'session-123',
      sanitizedText: 'Email: [EMAIL_001]',
      sanitizedFingerprint:
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      expiresAt: '2026-04-03T12:30:00+00:00',
      findings: [
        {
          id: 'finding-1',
          entityType: 'EMAIL',
          detector: 'regex:email',
          confidence: 0.95,
          confidenceLevel: 'high',
          start: 7,
          end: 24,
          originalText: 'user@example.com',
          placeholder: '[EMAIL_001]',
          reviewRecommended: false,
        },
      ],
      replacements: [
        {
          findingId: 'finding-1',
          entityType: 'EMAIL',
          start: 7,
          end: 24,
          originalText: 'user@example.com',
          placeholder: '[EMAIL_001]',
          confidence: 0.95,
          applied: true,
        },
      ],
      riskSummary: {
        score: 48,
        level: 'medium',
        findingsCount: 1,
        replacementCount: 1,
        lowConfidenceCount: 0,
        ambiguousCount: 0,
        reviewRequired: false,
        entityCounts: {
          EMAIL: 1,
        },
      },
    };

    expect(sanitizeResponseSchema.parse(payload).sessionId).toBe('session-123');
  });

  it('accepts revert and session payloads', () => {
    const revertPayload = {
      protocolVersion: 'v1',
      sessionId: 'session-123',
      revertedText: 'Email: user@example.com',
      totalReplacements: 1,
      replacements: [
        {
          placeholder: '[EMAIL_001]',
          originalText: 'user@example.com',
          count: 1,
        },
      ],
    };

    const sessionPayload = {
      protocolVersion: 'v1',
      sessionId: 'session-123',
      conversationId: 'tab:12:chat:new',
      createdAt: '2026-04-03T12:00:00+00:00',
      updatedAt: '2026-04-03T12:05:00+00:00',
      expiresAt: '2026-04-03T12:45:00+00:00',
      mappingCount: 1,
      replacementCount: 1,
      lowConfidenceCount: 0,
      reviewPending: false,
    };

    expect(revertResponseSchema.parse(revertPayload).totalReplacements).toBe(1);
    expect(sessionSummarySchema.parse(sessionPayload).conversationId).toContain(
      'chat',
    );
  });

  it('accepts runtime messages', () => {
    const payload = {
      type: 'runtime/reset-session',
      tabId: 21,
      conversationId: 'chat:new',
      sessionId: 'session-123',
    };

    expect(runtimeMessageSchema.parse(payload).type).toBe(
      'runtime/reset-session',
    );
  });
});
