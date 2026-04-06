import {
  healthResponseSchema,
  resetSessionRequestSchema,
  resetSessionResponseSchema,
  revertRequestSchema,
  revertResponseSchema,
  sanitizeRequestSchema,
  sanitizeResponseSchema,
  sessionSummarySchema,
  type HealthResponse,
  type ResetSessionRequest,
  type ResetSessionResponse,
  type RevertRequest,
  type RevertResponse,
  type SanitizeRequest,
  type SanitizeResponse,
  type SessionSummary,
} from '@chatgpt-anonymizer/contracts';

import { getSettings } from './settingsStore';

export class LocalEngineUnavailableError extends Error {
  constructor(message = 'Local engine unavailable') {
    super(message);
    this.name = 'LocalEngineUnavailableError';
  }
}

const ENGINE_TIMEOUT_MS = 4_000;

function toEngineErrorMessage(status: number): string {
  if (status === 404) {
    return 'Il motore locale non espone l endpoint richiesto. Verifica la compatibilita tra extension ed engine.';
  }
  if (status === 422) {
    return 'Il motore locale ha rifiutato la richiesta. Controlla i contratti condivisi e la configurazione del servizio.';
  }
  if (status >= 500) {
    return `Il motore locale ha restituito HTTP ${status}. Consulta i log locali del servizio.`;
  }
  return `Il motore locale non e disponibile (HTTP ${status}).`;
}

async function getBaseUrl(baseUrlOverride?: string): Promise<string> {
  if (baseUrlOverride) {
    return baseUrlOverride;
  }
  const settings = await getSettings();
  return settings.engineBaseUrl;
}

async function fetchFromEngine<T>(
  path: string,
  parser: { parse: (payload: unknown) => T },
  init: RequestInit,
  baseUrlOverride?: string,
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    ENGINE_TIMEOUT_MS,
  );

  try {
    const response = await fetch(
      `${await getBaseUrl(baseUrlOverride)}${path}`,
      {
        ...init,
        signal: controller.signal,
      },
    ).catch((error) => {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new LocalEngineUnavailableError(
          'Il motore locale non ha risposto entro il timeout atteso. Verifica che sia avviato e raggiungibile su 127.0.0.1.',
        );
      }
      throw new LocalEngineUnavailableError(
        'Il motore locale non e raggiungibile su 127.0.0.1. Avvialo oppure controlla porta e firewall locale.',
      );
    });

    if (!response.ok) {
      throw new LocalEngineUnavailableError(
        toEngineErrorMessage(response.status),
      );
    }

    return parser.parse(await response.json());
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function health(
  baseUrlOverride?: string,
): Promise<HealthResponse> {
  return fetchFromEngine(
    '/health',
    healthResponseSchema,
    {
      method: 'GET',
    },
    baseUrlOverride,
  );
}

export async function sanitize(
  payload: SanitizeRequest,
): Promise<SanitizeResponse> {
  const parsed = sanitizeRequestSchema.parse(payload);
  return fetchFromEngine('/sanitize', sanitizeResponseSchema, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(parsed),
  });
}

export async function revert(payload: RevertRequest): Promise<RevertResponse> {
  const parsed = revertRequestSchema.parse(payload);
  return fetchFromEngine('/revert', revertResponseSchema, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(parsed),
  });
}

export async function resetSession(
  payload: ResetSessionRequest,
): Promise<ResetSessionResponse> {
  const parsed = resetSessionRequestSchema.parse(payload);
  return fetchFromEngine('/sessions/reset', resetSessionResponseSchema, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(parsed),
  });
}

export async function getSession(sessionId: string): Promise<SessionSummary> {
  return fetchFromEngine(`/sessions/${sessionId}`, sessionSummarySchema, {
    method: 'GET',
  });
}
