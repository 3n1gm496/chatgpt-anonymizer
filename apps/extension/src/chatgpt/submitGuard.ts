import { health } from '../services/localEngineClient';
import type { SanitizationState } from '../services/sessionStore';
import {
  calculateChangeRatio,
  fingerprintText,
  hasSignificantChange,
  normalizeForFingerprint,
} from '../lib/diff';
import type { ComposerAdapter } from './composerAdapter';
import { looksLikeSubmitButton } from './selectors';

export type SubmitGuardState =
  | 'manual_current'
  | 'never_sanitized'
  | 'review_pending'
  | 'sanitized_current'
  | 'stale_after_edit'
  | 'engine_unreachable'
  | 'unsafe_attachments';

export interface SubmitGuardVerdict {
  allowed: boolean;
  state: SubmitGuardState;
  reason: string;
  currentFingerprint?: string;
  expectedFingerprint?: string;
  changeRatio?: number;
}

export interface SubmitGuardInputs {
  currentText: string;
  currentFingerprint: string;
  sessionState: SanitizationState | null;
  engineReachable: boolean;
  composerFingerprint?: string | null;
}

export type SubmitGuardHealthCheck = () => Promise<boolean>;
export type SubmitGuardAutoSanitizeResult =
  | 'submitted'
  | 'handled'
  | 'unhandled';

const EMAIL_PATTERN = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/;
const URL_PATTERN = /\bhttps?:\/\/[^\s<>"]+/i;
const HOSTNAME_PATTERN =
  /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.){1,5}[a-z]{2,}\b/i;
const PHONE_PATTERN =
  /(?:(?:\+\d{1,3}[ .-]?)?(?:\(\d{2,4}\)[ .-]?)?\d(?:[ .-]?\d){5,})/g;
const PHONE_CONTEXT_PATTERN =
  /\b(?:tel|telefono|mobile|cell(?:ulare)?|contatto|whatsapp|phone|call|sms|fax)\b/i;
const CODICE_FISCALE_PATTERN =
  /\b[A-Z]{6}[0-9]{2}[A-EHLMPRST][0-9]{2}[A-Z][0-9]{3}[A-Z]\b/i;

// PARTITA_IVA_PATTERN: requires the Luhn-like modulo-10 checksum to match.
// The previous bare /\b\d{11}\b/ caused false positives on ticket numbers,
// phone numbers, and other 11-digit values.  We replicate the Python
// _validate_partita_iva() logic here to keep the heuristics consistent.
const PARTITA_IVA_RAW_PATTERN = /\b(\d{11})\b/g;

function isValidPartitaIva(digits: string): boolean {
  if (digits.length !== 11) return false;
  let total = 0;
  for (let i = 0; i < 10; i++) {
    const d = parseInt(digits[i], 10);
    if (i % 2 === 0) {
      total += d;
    } else {
      const doubled = d * 2;
      total += doubled < 10 ? doubled : doubled - 9;
    }
  }
  return (10 - (total % 10)) % 10 === parseInt(digits[10], 10);
}

// IBAN pattern — MOD-97 validation is complex in TS; we use structural pattern
// + length as a strong-enough heuristic for the submit guard (not false-positive-safe
// enough for replacement, but safe enough to trigger re-sanitisation).
const IBAN_PATTERN = /\b[A-Z]{2}[0-9]{2}[A-Z0-9]{4,30}\b/gi;

// Secrets: vendor-prefixed tokens that are structurally unambiguous
const SECRETS_PATTERN =
  /\b(?:AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|ghs_[A-Za-z0-9]{36}|gho_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{82}|glpat-[A-Za-z0-9_-]{20}|sk_live_[A-Za-z0-9]{24}|npm_[A-Za-z0-9]{36}|AIza[0-9A-Za-z_-]{35})\b/;

// Connection strings in the text are also sensitive
const CONNSTR_PATTERN =
  /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|mssql):\/\/[^\s]{8,}/i;

// Payment card: 13-19 digits, optionally space/dash separated, with Luhn check
const PAYMENT_CARD_RAW_PATTERN = /\b(?:\d[ -]?){13,19}\b/g;

function isValidLuhn(digits: string): boolean {
  let total = 0;
  let isOdd = true;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = parseInt(digits[i], 10);
    if (!isOdd) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    total += d;
    isOdd = !isOdd;
  }
  return total % 10 === 0;
}

function containsValidPaymentCard(text: string): boolean {
  for (const match of text.matchAll(PAYMENT_CARD_RAW_PATTERN)) {
    const digits = match[0].replace(/[ -]/g, '');
    if (digits.length >= 13 && digits.length <= 19 && isValidLuhn(digits)) {
      return true;
    }
  }
  return false;
}

const IPV4_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const PLACEHOLDER_PATTERN = /\[[A-Z_0-9]+\]/g;

async function defaultHealthCheck(): Promise<boolean> {
  await health();
  return true;
}

function extractAddedText(
  currentText: string,
  trackedSanitizedText: string,
): string | null {
  const trackedIndex = currentText.indexOf(trackedSanitizedText);
  if (trackedIndex < 0) {
    return null;
  }

  return [
    currentText.slice(0, trackedIndex),
    currentText.slice(trackedIndex + trackedSanitizedText.length),
  ]
    .join(' ')
    .trim();
}

function isValidIpv4Candidate(value: string): boolean {
  const octets = value.split('.');
  return (
    octets.length === 4 &&
    octets.every((octet) => {
      const parsed = Number(octet);
      return (
        Number.isInteger(parsed) &&
        parsed >= 0 &&
        parsed <= 255 &&
        String(parsed) === String(Number(octet))
      );
    })
  );
}

function containsFormattedPhoneCandidate(value: string): boolean {
  return Array.from(value.matchAll(PHONE_PATTERN)).some((match) => {
    const candidate = match[0].trim();
    const digits = candidate.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) {
      return false;
    }

    if (
      /^(?:\d{1,3}\.){3}\d{1,3}$/.test(candidate) ||
      /^\d+(?:\.\d+){2,}$/.test(candidate)
    ) {
      return false;
    }

    if (/[+\s().-]/.test(candidate)) {
      return true;
    }

    const contextWindow = value.slice(
      Math.max(0, match.index - 24),
      Math.min(value.length, match.index + candidate.length + 24),
    );
    return digits.length >= 9 && PHONE_CONTEXT_PATTERN.test(contextWindow);
  });
}

function containsValidPartitaIva(text: string): boolean {
  for (const match of text.matchAll(PARTITA_IVA_RAW_PATTERN)) {
    const digits = match[1];
    if (digits !== undefined && isValidPartitaIva(digits)) return true;
  }
  return false;
}

function textLooksSensitive(text: string): boolean {
  const candidate = text.replace(PLACEHOLDER_PATTERN, ' ');
  if (!candidate.trim()) {
    return false;
  }

  if (
    EMAIL_PATTERN.test(candidate) ||
    URL_PATTERN.test(candidate) ||
    HOSTNAME_PATTERN.test(candidate) ||
    containsFormattedPhoneCandidate(candidate) ||
    CODICE_FISCALE_PATTERN.test(candidate) ||
    containsValidPartitaIva(candidate) ||
    SECRETS_PATTERN.test(candidate) ||
    CONNSTR_PATTERN.test(candidate) ||
    IBAN_PATTERN.test(candidate) ||
    containsValidPaymentCard(candidate)
  ) {
    return true;
  }

  return Array.from(candidate.matchAll(IPV4_PATTERN)).some((match) =>
    isValidIpv4Candidate(match[0]),
  );
}

export function deriveSubmitGuardVerdict(
  inputs: SubmitGuardInputs,
): SubmitGuardVerdict {
  const { currentText, currentFingerprint, sessionState } = inputs;

  if (sessionState?.unsafeAttachmentsPresent) {
    return {
      allowed: false,
      state: 'unsafe_attachments',
      reason:
        sessionState.unsafeAttachmentsReason ??
        'Sono presenti allegati nel prompt che non possono essere analizzati. Rimuovili prima di inviare.',
      currentFingerprint,
    };
  }

  if (!currentText.trim()) {
    return {
      allowed: true,
      state: 'sanitized_current',
      reason: 'Composer vuoto, nessuna sanitizzazione necessaria.',
      currentFingerprint,
      expectedFingerprint: sessionState?.sanitizedFingerprint,
      changeRatio: 0,
    };
  }

  if (
    !sessionState?.sanitizedFingerprint ||
    !sessionState.sanitizedText ||
    sessionState.replacementCount === 0
  ) {
    if (textLooksSensitive(currentText)) {
      return {
        allowed: false,
        state: 'never_sanitized',
        reason:
          'Questo prompt contiene testo che assomiglia a dati sensibili. Provo a proteggerlo automaticamente prima dell invio.',
        currentFingerprint,
      };
    }

    return {
      allowed: true,
      state: 'manual_current',
      reason:
        'Nessun contenuto sensibile gestito dall estensione in questo prompt. Puoi inviare normalmente.',
      currentFingerprint,
    };
  }

  if (currentFingerprint === sessionState.sanitizedFingerprint) {
    return {
      allowed: true,
      state: 'sanitized_current',
      reason: 'Il testo corrente corrisponde all ultima sanitizzazione valida.',
      currentFingerprint,
      expectedFingerprint: sessionState.sanitizedFingerprint,
      changeRatio: 0,
    };
  }

  const addedText = extractAddedText(currentText, sessionState.sanitizedText);
  if (addedText !== null && !textLooksSensitive(addedText)) {
    return {
      allowed: true,
      state: 'sanitized_current',
      reason:
        'Hai aggiunto solo testo che non assomiglia ai dati sensibili gestiti dal controllo locale.',
      currentFingerprint,
      expectedFingerprint: sessionState.sanitizedFingerprint,
      changeRatio: calculateChangeRatio(
        sessionState.sanitizedText,
        currentText,
      ),
    };
  }

  const normalizedCurrent = normalizeForFingerprint(currentText);
  const normalizedTracked = normalizeForFingerprint(sessionState.sanitizedText);
  const changeRatio = calculateChangeRatio(
    sessionState.sanitizedText,
    currentText,
  );
  if (normalizedTracked && normalizedCurrent.includes(normalizedTracked)) {
    if (changeRatio > 0.18) {
      // The protected block is still visible, but the surrounding delta looks substantial.
    } else {
      return {
        allowed: true,
        state: 'sanitized_current',
        reason:
          'Le parti già pseudonimizzate sono ancora integre e le differenze residue sono minime.',
        currentFingerprint,
        expectedFingerprint: sessionState.sanitizedFingerprint,
        changeRatio,
      };
    }
  }

  const requiresResanitization =
    currentFingerprint === sessionState.sourceTextFingerprint ||
    hasSignificantChange(sessionState.sanitizedText, currentText) ||
    textLooksSensitive(addedText ?? currentText);

  if (!requiresResanitization) {
    return {
      allowed: true,
      state: 'sanitized_current',
      reason:
        'Sono state rilevate solo differenze minime rispetto all ultima pseudonimizzazione valida.',
      currentFingerprint,
      expectedFingerprint: sessionState.sanitizedFingerprint,
      changeRatio,
    };
  }

  if (!inputs.engineReachable) {
    return {
      allowed: false,
      state: 'engine_unreachable',
      reason:
        'Hai modificato un testo già protetto, ma il motore locale non è raggiungibile per ricontrollarlo. Riavvialo e riprova.',
      currentFingerprint,
      expectedFingerprint: sessionState.sanitizedFingerprint,
      changeRatio,
    };
  }

  return {
    allowed: false,
    state: 'stale_after_edit',
    reason:
      'Hai cambiato il prompt dopo l ultima pseudonimizzazione. Lo ricontrollo automaticamente prima dell invio.',
    currentFingerprint,
    expectedFingerprint: sessionState.sanitizedFingerprint,
    changeRatio,
  };
}

export async function evaluateSubmitGuard(
  currentText: string,
  state: SanitizationState | null,
  options?: {
    composerFingerprint?: string | null;
    healthCheck?: SubmitGuardHealthCheck;
  },
): Promise<SubmitGuardVerdict> {
  const currentFingerprint = await fingerprintText(currentText);
  const preliminaryVerdict = deriveSubmitGuardVerdict({
    currentText,
    currentFingerprint,
    sessionState: state,
    engineReachable: true,
    composerFingerprint: options?.composerFingerprint ?? null,
  });

  if (
    !currentText.trim() ||
    preliminaryVerdict.state === 'never_sanitized' ||
    !state?.sanitizedFingerprint ||
    !state.sanitizedText ||
    state.replacementCount === 0 ||
    preliminaryVerdict.allowed
  ) {
    return preliminaryVerdict;
  }

  let engineReachable = true;
  try {
    engineReachable = await (options?.healthCheck ?? defaultHealthCheck)();
  } catch {
    engineReachable = false;
  }

  return deriveSubmitGuardVerdict({
    currentText,
    currentFingerprint,
    sessionState: state,
    engineReachable,
    composerFingerprint: options?.composerFingerprint ?? null,
  });
}

export function registerSubmitGuard(options: {
  adapter: ComposerAdapter;
  getState: () => Promise<SanitizationState | null>;
  onBlocked: (verdict: SubmitGuardVerdict) => void;
  onAutoSanitize?: (input: {
    currentText: string;
    state: SanitizationState | null;
    verdict: SubmitGuardVerdict;
  }) => Promise<SubmitGuardAutoSanitizeResult>;
  healthCheck?: SubmitGuardHealthCheck;
}): () => void {
  let bypassNextSubmit = false;

  const waitForComposerFlush = async (): Promise<void> =>
    new Promise((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
    });

  const handleAttempt = async (event: Event) => {
    if (bypassNextSubmit) {
      bypassNextSubmit = false;
      return;
    }

    const target = event.target;
    const isRelevantKeydown =
      event instanceof KeyboardEvent &&
      event.key === 'Enter' &&
      !event.shiftKey &&
      options.adapter.containsComposerTarget(target);
    const clickedButton =
      target instanceof HTMLButtonElement
        ? target
        : target instanceof Element
          ? target.closest('button')
          : null;
    const isRelevantClick =
      event instanceof MouseEvent &&
      target instanceof Element &&
      (options.adapter.findSubmitButton()?.contains(target) ||
        looksLikeSubmitButton(clickedButton));
    const isRelevantSubmit =
      event.type === 'submit' &&
      options.adapter.discoverComposer()?.form === target;

    if (!isRelevantKeydown && !isRelevantClick && !isRelevantSubmit) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const currentText = options.adapter.getComposerText();
    const state = await options.getState();
    const verdict = await evaluateSubmitGuard(currentText, state, {
      composerFingerprint: options.adapter.getComposerFingerprint(),
      healthCheck: options.healthCheck,
    });

    const shouldAutoSanitize =
      Boolean(currentText.trim()) &&
      (verdict.state === 'manual_current' ||
        verdict.state === 'never_sanitized' ||
        verdict.state === 'stale_after_edit');
    if (shouldAutoSanitize && options.onAutoSanitize) {
      const autoSanitizeResult = await options.onAutoSanitize({
        currentText,
        state,
        verdict,
      });
      if (autoSanitizeResult === 'submitted') {
        bypassNextSubmit = true;
        await waitForComposerFlush();
        options.adapter.submit();
        return;
      }
      if (autoSanitizeResult === 'handled') {
        return;
      }
    }

    if (!verdict.allowed) {
      options.onBlocked(verdict);
      return;
    }

    bypassNextSubmit = true;
    options.adapter.submit();
  };

  document.addEventListener('keydown', handleAttempt, true);
  document.addEventListener('click', handleAttempt, true);
  document.addEventListener('submit', handleAttempt, true);
  return () => {
    document.removeEventListener('keydown', handleAttempt, true);
    document.removeEventListener('click', handleAttempt, true);
    document.removeEventListener('submit', handleAttempt, true);
  };
}
