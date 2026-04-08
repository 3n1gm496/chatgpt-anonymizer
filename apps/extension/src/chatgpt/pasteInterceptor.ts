import type {
  SanitizeRequest,
  SanitizeResponse,
} from '@chatgpt-anonymizer/contracts';

import { fingerprintText, normalizeForFingerprint } from '../lib/diff';
import {
  dataTransferContainsFiles,
  extractSanitizableTextFromDataTransfer,
  mergeComposerText,
  normalizeLineBreaks,
} from '../lib/richText';
import type { ComposerAdapter } from './composerAdapter';
import {
  beginSanitizationRequest,
  completeSanitizationRequest,
  ensureSessionState,
  failSanitizationRequest,
  type SanitizationState,
  type SessionScope,
} from '../services/sessionStore';

export interface SanitizeTextDeps {
  adapter: Pick<
    ComposerAdapter,
    | 'containsComposerTarget'
    | 'focusComposer'
    | 'getComposerFingerprint'
    | 'getComposerText'
    | 'replaceComposerText'
  >;
  sanitize: (payload: SanitizeRequest) => Promise<SanitizeResponse>;
  scope: SessionScope;
}

export interface SanitizeComposerResult {
  ignored: boolean;
  response?: SanitizeResponse;
  state?: SanitizationState;
  originalComposerText?: string;
  sanitizedComposerText?: string;
}

export async function sanitizeInterceptedText(
  text: string,
  detectedContentType: 'paste' | 'drop' | 'manual',
  deps: SanitizeTextDeps,
): Promise<
  | { ignored: true }
  | {
      ignored: false;
      response: SanitizeResponse;
      state: SanitizationState;
      previousComposerText: string;
      sanitizedChunkText: string;
      fullComposerText: string;
      baseReplacementCount: number;
      baseLowConfidenceCount: number;
    }
> {
  const previousComposerText = deps.adapter.getComposerText();
  const composerFingerprint =
    deps.adapter.getComposerFingerprint() ?? undefined;
  const request = await beginSanitizationRequest(deps.scope, {
    composerFingerprint,
    engineHealthy: true,
  });
  const existingState = await ensureSessionState(deps.scope);
  const normalizedPreviousComposer =
    normalizeForFingerprint(previousComposerText);
  const normalizedTrackedComposer = normalizeForFingerprint(
    existingState.sanitizedText ?? '',
  );
  const isContinuation =
    Boolean(normalizedTrackedComposer) &&
    (normalizedPreviousComposer === normalizedTrackedComposer ||
      normalizedPreviousComposer.startsWith(normalizedTrackedComposer));
  const baseReplacementCount = isContinuation
    ? existingState.replacementCount
    : 0;
  const baseLowConfidenceCount = isContinuation
    ? existingState.lowConfidenceCount
    : 0;

  try {
    const response = await deps.sanitize({
      protocolVersion: 'v1',
      conversationId: deps.scope.engineConversationId,
      sessionId: existingState.sessionId,
      text,
      detectedContentType,
      exclusions: [],
      options: {
        enableHeuristics: true,
      },
    });

    const fullComposerText = mergeComposerText(
      previousComposerText,
      response.sanitizedText,
    );
    const sourceComposerText = mergeComposerText(previousComposerText, text);
    const sourceTextFingerprint = await fingerprintText(sourceComposerText);
    const result = await completeSanitizationRequest(
      deps.scope.sessionKey,
      request.requestId,
      {
        sessionId: response.sessionId,
        sanitizedText: fullComposerText,
        sanitizedFingerprint: await fingerprintText(fullComposerText),
        sourceTextFingerprint,
        replacementCount:
          response.replacements.filter((replacement) => replacement.applied)
            .length + baseReplacementCount,
        lowConfidenceCount:
          response.riskSummary.lowConfidenceCount + baseLowConfidenceCount,
        reviewPending: false,
        reviewDecisions: {},
        engineHealthy: true,
        sanitizedAt: new Date().toISOString(),
        expiresAt: response.expiresAt,
        composerFingerprint,
      },
    );

    if (!result.committed || !result.state) {
      return { ignored: true };
    }

    deps.adapter.focusComposer();
    const written = deps.adapter.replaceComposerText(fullComposerText);
    if (!written) {
      throw new Error(
        'Il campo di testo non è stato trovato: il testo pseudonimizzato non è stato scritto nel composer. Ricarica la pagina e riprova.',
      );
    }
    // Verify the write actually persisted synchronously.
    const actualText = deps.adapter.getComposerText();
    const expectedNorm = normalizeLineBreaks(fullComposerText)
      .replace(/\n+$/, '')
      .trim();
    const actualNorm = normalizeLineBreaks(actualText)
      .replace(/\n+$/, '')
      .trim();
    if (actualNorm !== expectedNorm) {
      throw new Error(
        'Il testo nel composer non corrisponde a quello pseudonimizzato: la pagina ha sovrascritto il campo durante la scrittura. Ricarica e riprova.',
      );
    }
    return {
      ignored: false,
      response,
      state: result.state,
      previousComposerText,
      sanitizedChunkText: response.sanitizedText,
      fullComposerText,
      baseReplacementCount,
      baseLowConfidenceCount,
    };
  } catch (error) {
    await failSanitizationRequest(deps.scope.sessionKey, request.requestId, {
      engineHealthy: false,
    });
    throw error;
  }
}

export async function sanitizeComposerText(
  detectedContentType: 'manual',
  deps: SanitizeTextDeps,
): Promise<SanitizeComposerResult> {
  const originalComposerText = deps.adapter.getComposerText();
  if (!originalComposerText.trim()) {
    return { ignored: true };
  }

  const composerFingerprint =
    deps.adapter.getComposerFingerprint() ?? undefined;
  const request = await beginSanitizationRequest(deps.scope, {
    composerFingerprint,
    engineHealthy: true,
  });
  const existingState = await ensureSessionState(deps.scope);

  try {
    const response = await deps.sanitize({
      protocolVersion: 'v1',
      conversationId: deps.scope.engineConversationId,
      sessionId: existingState.sessionId,
      text: originalComposerText,
      detectedContentType,
      exclusions: [],
      options: {
        enableHeuristics: true,
      },
    });

    const result = await completeSanitizationRequest(
      deps.scope.sessionKey,
      request.requestId,
      {
        sessionId: response.sessionId,
        sanitizedText: response.sanitizedText,
        sanitizedFingerprint: await fingerprintText(response.sanitizedText),
        sourceTextFingerprint: await fingerprintText(originalComposerText),
        replacementCount: response.replacements.filter(
          (replacement) => replacement.applied,
        ).length,
        lowConfidenceCount: response.riskSummary.lowConfidenceCount,
        reviewPending: false,
        reviewDecisions: {},
        engineHealthy: true,
        sanitizedAt: new Date().toISOString(),
        expiresAt: response.expiresAt,
        composerFingerprint,
      },
    );

    if (!result.committed || !result.state) {
      return { ignored: true };
    }

    deps.adapter.focusComposer();
    const written = deps.adapter.replaceComposerText(response.sanitizedText);
    if (!written) {
      throw new Error(
        'Il campo di testo non è stato trovato: il testo pseudonimizzato non è stato scritto nel composer. Ricarica la pagina e riprova.',
      );
    }
    // Verify the write actually persisted synchronously.
    const actualTextManual = deps.adapter.getComposerText();
    const expectedNormManual = normalizeLineBreaks(response.sanitizedText)
      .replace(/\n+$/, '')
      .trim();
    const actualNormManual = normalizeLineBreaks(actualTextManual)
      .replace(/\n+$/, '')
      .trim();
    if (actualNormManual !== expectedNormManual) {
      throw new Error(
        'Il testo nel composer non corrisponde a quello pseudonimizzato: la pagina ha sovrascritto il campo durante la scrittura. Ricarica e riprova.',
      );
    }
    return {
      ignored: false,
      response,
      state: result.state,
      originalComposerText,
      sanitizedComposerText: response.sanitizedText,
    };
  } catch (error) {
    await failSanitizationRequest(deps.scope.sessionKey, request.requestId, {
      engineHealthy: false,
    });
    throw error;
  }
}

export interface PasteInterceptorOptions {
  adapter: Pick<
    ComposerAdapter,
    | 'containsComposerTarget'
    | 'focusComposer'
    | 'getComposerFingerprint'
    | 'getComposerText'
    | 'replaceComposerText'
  >;
  sanitize: (payload: SanitizeRequest) => Promise<SanitizeResponse>;
  getSessionScope: () => Promise<SessionScope>;
  onError: (message: string) => void;
  onAttachmentRisk: (message: string) => void | Promise<void>;
  onNotice: (message: string) => void;
  onProcessing: (contentType: 'paste' | 'drop') => void;
  onSanitized: (
    result: Exclude<
      Awaited<ReturnType<typeof sanitizeInterceptedText>>,
      {
        ignored: true;
      }
    >,
    originalText: string,
    context: {
      hasFiles: boolean;
      extractedFileCount: number;
      skippedFileCount: number;
      truncated: boolean;
      hadDirectText: boolean;
    },
  ) => void;
}

export function registerPasteInterceptor(
  options: PasteInterceptorOptions,
): () => void {
  // Track IME/input-composition state. Paste events that arrive while the user
  // is composing a character via an input method (e.g. Japanese, Chinese, Korean)
  // must not be intercepted: the browser paste during an active composition is
  // either a browser implementation detail or caused by an IME helper, not by
  // the user deliberately pasting external content.
  let isComposing = false;
  const handleCompositionStart = () => {
    isComposing = true;
  };
  const handleCompositionEnd = () => {
    isComposing = false;
  };

  const handlePaste = async (event: ClipboardEvent) => {
    if (isComposing) {
      return;
    }
    if (!options.adapter.containsComposerTarget(event.target)) {
      return;
    }

    // CRITICAL: preventDefault MUST be called synchronously before any await.
    // An async function suspends at the first await, returning control to the
    // event loop. At that point the browser fires the default paste behaviour
    // and commits the original unsanitised text to the composer DOM.
    // Calling preventDefault() here — while still in the synchronous portion
    // of the handler — suppresses that default delivery. The clipboardData
    // reference remains valid across the async boundary because it is captured
    // in the closure before any suspension occurs.
    event.preventDefault();

    const hasFiles = dataTransferContainsFiles(event.clipboardData);
    const extracted = await extractSanitizableTextFromDataTransfer(
      event.clipboardData,
    );
    const text = extracted.text;
    if (!text) {
      if (hasFiles) {
        const message =
          extracted.skippedFileCount > 0
            ? 'Ci sono file non analizzati nel prompt: rimuovili oppure incolla solo il loro testo prima di inviare.'
            : 'Gli allegati restano originali: rimuovili oppure incolla solo il loro testo prima di inviare.';
        await options.onAttachmentRisk(message);
        options.onNotice(message);
      }
      return;
    }

    options.onProcessing('paste');
    try {
      const result = await sanitizeInterceptedText(text, 'paste', {
        adapter: options.adapter,
        sanitize: options.sanitize,
        scope: await options.getSessionScope(),
      });
      if (!result.ignored) {
        options.onSanitized(result, text, {
          hasFiles,
          extractedFileCount: extracted.extractedFileCount,
          skippedFileCount: extracted.skippedFileCount,
          truncated: extracted.truncated,
          hadDirectText: extracted.hadDirectText,
        });
      }
    } catch (error) {
      options.onError(
        error instanceof Error
          ? error.message
          : 'Errore durante la sanitizzazione locale.',
      );
    }
  };

  const handleDrop = async (event: DragEvent) => {
    if (!options.adapter.containsComposerTarget(event.target)) {
      return;
    }

    // CRITICAL: same race fix as handlePaste — preventDefault must be called
    // synchronously before the first await. For drag-and-drop this is even
    // more important: without early prevention the browser fires the native
    // file-upload handler, potentially sending the original unprocessed file
    // directly to ChatGPT before local pseudonymisation has occurred.
    event.preventDefault();

    const hasFiles = dataTransferContainsFiles(event.dataTransfer);
    const extracted = await extractSanitizableTextFromDataTransfer(
      event.dataTransfer,
    );
    const text = extracted.text;
    if (!text) {
      if (hasFiles) {
        const message =
          extracted.skippedFileCount > 0
            ? 'I file trascinati non sono stati analizzati completamente: rimuovili oppure incolla solo il loro testo prima di inviare.'
            : 'I file trascinati restano originali: rimuovili oppure incolla solo il loro testo prima di inviare.';
        await options.onAttachmentRisk(message);
        options.onNotice(message);
      }
      return;
    }

    options.onProcessing('drop');
    try {
      const result = await sanitizeInterceptedText(text, 'drop', {
        adapter: options.adapter,
        sanitize: options.sanitize,
        scope: await options.getSessionScope(),
      });
      if (!result.ignored) {
        options.onSanitized(result, text, {
          hasFiles,
          extractedFileCount: extracted.extractedFileCount,
          skippedFileCount: extracted.skippedFileCount,
          truncated: extracted.truncated,
          hadDirectText: extracted.hadDirectText,
        });
      }
    } catch (error) {
      options.onError(
        error instanceof Error
          ? error.message
          : 'Errore durante la sanitizzazione locale.',
      );
    }
  };

  document.addEventListener('compositionstart', handleCompositionStart, true);
  document.addEventListener('compositionend', handleCompositionEnd, true);
  document.addEventListener('paste', handlePaste, true);
  document.addEventListener('drop', handleDrop, true);
  return () => {
    document.removeEventListener(
      'compositionstart',
      handleCompositionStart,
      true,
    );
    document.removeEventListener('compositionend', handleCompositionEnd, true);
    document.removeEventListener('paste', handlePaste, true);
    document.removeEventListener('drop', handleDrop, true);
  };
}

export interface InputDebouncerOptions {
  adapter: Pick<
    ComposerAdapter,
    | 'containsComposerTarget'
    | 'focusComposer'
    | 'getComposerFingerprint'
    | 'getComposerText'
    | 'replaceComposerText'
  >;
  sanitize: (payload: SanitizeRequest) => Promise<SanitizeResponse>;
  getSessionScope: () => Promise<SessionScope>;
  debounceMs?: number;
  onProcessing: () => void;
  onSanitized: (result: SanitizeComposerResult) => void;
  onError: (message: string) => void;
}

export function registerInputDebouncer(
  options: InputDebouncerOptions,
): () => void {
  let isSanitizing = false;
  let isComposing = false;
  let debounceTimer: ReturnType<typeof window.setTimeout> | null = null;

  const handleCompositionStart = () => {
    isComposing = true;
  };
  const handleCompositionEnd = () => {
    isComposing = false;
  };

  const handleInput = (event: Event) => {
    if (isSanitizing || isComposing) {
      return;
    }
    if (!options.adapter.containsComposerTarget(event.target)) {
      return;
    }
    if (debounceTimer !== null) {
      window.clearTimeout(debounceTimer);
    }
    debounceTimer = window.setTimeout(() => {
      debounceTimer = null;
      isSanitizing = true;
      options.onProcessing();
      void (async () => {
        try {
          const result = await sanitizeComposerText('manual', {
            adapter: options.adapter,
            sanitize: options.sanitize,
            scope: await options.getSessionScope(),
          });
          if (!result.ignored) {
            options.onSanitized(result);
          }
        } catch (error) {
          options.onError(
            error instanceof Error
              ? error.message
              : 'Errore durante la verifica automatica del testo digitato.',
          );
        } finally {
          isSanitizing = false;
        }
      })();
    }, options.debounceMs ?? 1500);
  };

  document.addEventListener('compositionstart', handleCompositionStart, true);
  document.addEventListener('compositionend', handleCompositionEnd, true);
  document.addEventListener('input', handleInput, true);
  return () => {
    if (debounceTimer !== null) {
      window.clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    document.removeEventListener(
      'compositionstart',
      handleCompositionStart,
      true,
    );
    document.removeEventListener('compositionend', handleCompositionEnd, true);
    document.removeEventListener('input', handleInput, true);
  };
}
