import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';

import type { RuntimeMessage } from '@chatgpt-anonymizer/contracts';

import { createComposerAdapter } from '../chatgpt/composerAdapter';
import {
  registerPasteInterceptor,
  sanitizeComposerText,
} from '../chatgpt/pasteInterceptor';
import { registerResponseOverlay } from '../chatgpt/responseOverlay';
import {
  registerSubmitGuard,
  type SubmitGuardVerdict,
} from '../chatgpt/submitGuard';
import { StatusPill } from '../components/StatusPill';
import { health, sanitize } from '../services/localEngineClient';
import {
  buildSessionScope,
  ensureSessionState,
  getSessionState,
  patchSessionState,
  saveSessionState,
  type SessionScope,
} from '../services/sessionStore';
import { getSettings } from '../services/settingsStore';
import '../styles/content.css';

type StatusMode =
  | 'idle'
  | 'processing'
  | 'ready'
  | 'blocked'
  | 'error'
  | 'notice';

const extensionGlobal = globalThis as typeof globalThis & {
  browser?: {
    runtime?: {
      sendMessage?: (message: RuntimeMessage) => Promise<unknown>;
    };
  };
  chrome?: typeof chrome;
};

type ManagedRoot = {
  host: HTMLElement;
  root: Root;
};

const FALLBACK_SCOPE_STORAGE_KEY = 'chatgpt-anonymizer/page-scope';
const NATIVE_ATTACHMENT_RISK_MESSAGE =
  'Sono presenti allegati già caricati nel prompt. Il testo resta protetto, ma il contenuto degli allegati caricati direttamente in ChatGPT non viene ancora riscritto automaticamente.';

function getRootParent(): HTMLElement {
  return document.body ?? document.documentElement;
}

async function waitForRootParent(
  ctx: ContentScriptContext,
): Promise<HTMLElement> {
  const existingParent = getRootParent();
  if (existingParent) {
    return existingParent;
  }

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const parent = getRootParent();
      if (!parent) {
        return;
      }
      observer.disconnect();
      resolve(parent);
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    ctx.onInvalidated(() => observer.disconnect());
  });
}

function ensureRoot(id: string, parent: HTMLElement): ManagedRoot {
  const staleHost = document.getElementById(id);
  if (staleHost) {
    staleHost.remove();
  }

  const host = document.createElement('div');
  host.id = id;
  parent.append(host);

  return {
    host,
    root: createRoot(host),
  };
}

async function getRuntimeContext(conversationId: string): Promise<{
  tabId: number;
  conversationId: string;
}> {
  try {
    const runtime =
      extensionGlobal.browser?.runtime ?? extensionGlobal.chrome?.runtime;
    const reply = (await runtime?.sendMessage?.({
      type: 'runtime/get-tab-context',
    } as RuntimeMessage)) as
      | { tabId?: number; conversationId?: string }
      | undefined;

    return {
      tabId: reply?.tabId ?? 0,
      conversationId: reply?.conversationId ?? conversationId,
    };
  } catch {
    return { tabId: 0, conversationId };
  }
}

function getFallbackScopeId(): string {
  try {
    const existing = window.sessionStorage.getItem(FALLBACK_SCOPE_STORAGE_KEY);
    if (existing) {
      return existing;
    }

    const created =
      globalThis.crypto?.randomUUID?.() ??
      `page-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    window.sessionStorage.setItem(FALLBACK_SCOPE_STORAGE_KEY, created);
    return created;
  } catch {
    return `page-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function messageForBlockedSubmit(verdict: SubmitGuardVerdict): string {
  switch (verdict.state) {
    case 'manual_current':
      return verdict.reason;
    case 'review_pending':
      return verdict.reason;
    case 'unsafe_attachments':
      return verdict.reason;
    case 'engine_unreachable':
      return verdict.reason;
    case 'never_sanitized':
      return verdict.reason;
    case 'stale_after_edit':
      return verdict.reason;
    case 'sanitized_current':
      return 'Invio consentito.';
  }
}

export default defineContentScript({
  matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
  runAt: 'document_idle',
  async main(ctx) {
    const rootParent = await waitForRootParent(ctx);
    const adapter = createComposerAdapter(document);
    const statusRoot = ensureRoot('cga-status-root', rootParent);

    let statusMode: StatusMode = 'idle';
    let statusMessage = '';
    let statusVisible = false;
    let replacementCount = 0;
    let statusHideTimer: number | null = null;

    let runtimeContext = await getRuntimeContext(adapter.getConversationId());
    let currentScope: SessionScope = buildSessionScope(
      runtimeContext.tabId,
      runtimeContext.conversationId,
      runtimeContext.tabId === 0
        ? { fallbackScopeId: getFallbackScopeId() }
        : undefined,
    );

    const render = () => {
      statusRoot.root.render(
        statusVisible ? (
          <StatusPill
            mode={statusMode}
            message={statusMessage}
            replacementCount={replacementCount}
          />
        ) : null,
      );
    };

    const clearStatusTimer = () => {
      if (statusHideTimer !== null) {
        window.clearTimeout(statusHideTimer);
        statusHideTimer = null;
      }
    };

    const setStatus = (
      mode: StatusMode,
      message: string,
      options?: {
        autoHideMs?: number;
        replacementCount?: number;
      },
    ) => {
      clearStatusTimer();
      statusMode = mode;
      statusMessage = message;
      if (typeof options?.replacementCount === 'number') {
        replacementCount = options.replacementCount;
      }
      statusVisible = mode !== 'idle';
      render();

      if (options?.autoHideMs && mode !== 'blocked' && mode !== 'error') {
        statusHideTimer = window.setTimeout(() => {
          statusVisible = false;
          render();
        }, options.autoHideMs);
      }
    };

    async function syncRuntimeContext(): Promise<SessionScope> {
      const nextContext = await getRuntimeContext(adapter.getConversationId());
      const nextScope = buildSessionScope(
        nextContext.tabId,
        nextContext.conversationId,
        nextContext.tabId === 0
          ? { fallbackScopeId: getFallbackScopeId() }
          : undefined,
      );

      runtimeContext = nextContext;
      currentScope = nextScope;
      return currentScope;
    }

    const persistScopePatch = async (
      patch: Partial<Awaited<ReturnType<typeof ensureSessionState>>>,
    ) => {
      const current = await ensureSessionState(currentScope);
      await saveSessionState({
        ...current,
        ...patch,
        reviewPending: false,
        reviewDecisions: {},
      });
    };

    const syncNativeAttachmentRisk = async () => {
      await syncRuntimeContext();
      const hasNativeAttachments = adapter.hasNativeAttachments();
      const currentState = await getSessionState(currentScope.sessionKey);
      const currentlyMarked = currentState?.unsafeAttachmentsPresent ?? false;
      const currentReason = currentState?.unsafeAttachmentsReason ?? '';
      const isNativeAttachmentReason =
        currentReason === NATIVE_ATTACHMENT_RISK_MESSAGE;

      if (hasNativeAttachments) {
        if (!currentlyMarked || !isNativeAttachmentReason) {
          await persistScopePatch({
            unsafeAttachmentsPresent: true,
            unsafeAttachmentsReason: NATIVE_ATTACHMENT_RISK_MESSAGE,
          });
          if (statusMode !== 'processing') {
            setStatus('notice', NATIVE_ATTACHMENT_RISK_MESSAGE, {
              autoHideMs: 3400,
            });
          }
        }
        return;
      }

      if (currentlyMarked && isNativeAttachmentReason) {
        await persistScopePatch({
          unsafeAttachmentsPresent: false,
          unsafeAttachmentsReason: undefined,
        });
        if (
          (statusMode === 'blocked' || statusMode === 'notice') &&
          statusMessage === NATIVE_ATTACHMENT_RISK_MESSAGE
        ) {
          statusVisible = false;
          render();
        }
      }
    };

    const runAutomaticComposerSanitization = async (
      verdict: SubmitGuardVerdict,
    ): Promise<'submitted' | 'handled' | 'unhandled'> => {
      const waitForComposerFlush = async (): Promise<void> =>
        new Promise((resolve) => {
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => resolve());
          });
        });

      const trySanitizeComposer = async () => {
        const scope = await syncRuntimeContext();
        const result = await sanitizeComposerText('manual', {
          adapter,
          sanitize,
          scope,
        });
        return { scope, result };
      };

      try {
        setStatus(
          'processing',
          'Sto proteggendo automaticamente il testo del prompt prima dell invio.',
        );
        let { scope, result } = await trySanitizeComposer();
        if (result.ignored) {
          await waitForComposerFlush();
          ({ scope, result } = await trySanitizeComposer());
        }
        if (result.ignored || !result.response || !result.state) {
          if (verdict.state === 'manual_current') {
            setStatus(
              'notice',
              'Il prompt resta modificabile. Lo ricontrollerò automaticamente al prossimo invio.',
              { autoHideMs: 2200 },
            );
            return 'unhandled';
          }

          setStatus(
            'error',
            'Non sono riuscito a proteggere il prompt in tempo. Riprova tra un attimo.',
          );
          return 'handled';
        }

        const hasNativeAttachments = adapter.hasNativeAttachments();
        await patchSessionState(scope.sessionKey, {
          engineHealthy: true,
          unsafeAttachmentsPresent: hasNativeAttachments,
          unsafeAttachmentsReason: hasNativeAttachments
            ? NATIVE_ATTACHMENT_RISK_MESSAGE
            : undefined,
          reviewPending: false,
          reviewDecisions: {},
        });

        const response = result.response;
        const baseMessage =
          response.replacements.length > 0
            ? 'Prompt protetto automaticamente prima dell invio.'
            : 'Prompt verificato automaticamente prima dell invio.';
        const lowConfidenceMessage =
          response.riskSummary.lowConfidenceCount > 0
            ? ' Le rilevazioni più prudenti sono state gestite in automatico.'
            : '';
        const attachmentMessage = hasNativeAttachments
          ? ` ${NATIVE_ATTACHMENT_RISK_MESSAGE}`
          : '';
        setStatus(
          'ready',
          `${baseMessage}${lowConfidenceMessage}${attachmentMessage}`,
          {
            replacementCount: result.state.replacementCount,
            autoHideMs: 2400,
          },
        );
        return 'submitted';
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Errore durante la sanitizzazione automatica del prompt.';
        if (verdict.state === 'manual_current') {
          setStatus(
            'notice',
            `${message} Il testo non sembra sensibile: puoi comunque inviare.`,
            { autoHideMs: 2600 },
          );
          return 'unhandled';
        }

        void patchSessionState(currentScope.sessionKey, {
          engineHealthy: false,
        });
        setStatus('error', message);
        return 'handled';
      }
    };

    render();

    const stopPasteInterceptor = registerPasteInterceptor({
      adapter,
      sanitize,
      getSessionScope: syncRuntimeContext,
      onProcessing: (contentType) => {
        setStatus(
          'processing',
          contentType === 'paste'
            ? 'Sto proteggendo il testo appena incollato nel prompt.'
            : 'Sto proteggendo il testo trascinato nel prompt.',
        );
      },
      onNotice: (message) => {
        setStatus('notice', message, { autoHideMs: 3600 });
      },
      onAttachmentRisk: async (message) => {
        await persistScopePatch({
          unsafeAttachmentsPresent: true,
          unsafeAttachmentsReason: message,
        });
        setStatus('notice', message, { autoHideMs: 3800 });
      },
      onError: (message) => {
        void patchSessionState(currentScope.sessionKey, {
          engineHealthy: false,
        });
        setStatus('error', message);
      },
      onSanitized: async (result, _originalText, context) => {
        const { response, state } = result;
        const hasNativeAttachments = adapter.hasNativeAttachments();
        const hasUnsafeAttachments =
          hasNativeAttachments ||
          (context.hasFiles &&
            (context.extractedFileCount === 0 || context.skippedFileCount > 0));
        const unsafeAttachmentMessage = hasNativeAttachments
          ? NATIVE_ATTACHMENT_RISK_MESSAGE
          : 'Alcuni file non sono stati analizzati completamente e restano invariati.';

        await patchSessionState(currentScope.sessionKey, {
          engineHealthy: true,
          unsafeAttachmentsPresent: hasUnsafeAttachments,
          unsafeAttachmentsReason: hasUnsafeAttachments
            ? unsafeAttachmentMessage
            : undefined,
          reviewPending: false,
          reviewDecisions: {},
        });

        const fileNotes: string[] = [];
        if (context.extractedFileCount > 0) {
          fileNotes.push(
            context.hadDirectText
              ? `Ho protetto anche il testo estratto da ${context.extractedFileCount} file.`
              : `Ho estratto e protetto il testo da ${context.extractedFileCount} file.`,
          );
        }
        if (context.skippedFileCount > 0) {
          fileNotes.push(
            `${context.skippedFileCount} file sono rimasti fuori perché non testuali o troppo grandi.`,
          );
        }
        if (hasNativeAttachments) {
          fileNotes.push(
            'Gli allegati già caricati nel prompt restano invariati finché non li sostituisci con testo.',
          );
        }
        if (context.truncated) {
          fileNotes.push(
            'Ho usato solo la parte iniziale del contenuto per restare entro il limite di sicurezza locale.',
          );
        }

        let nextMessage =
          response.replacements.length > 0
            ? 'Protezione completata. Il prompt resta modificabile.'
            : result.baseReplacementCount > 0
              ? 'Ho aggiunto il nuovo testo senza toccare la parte già protetta del prompt.'
              : 'Nessun nuovo dato sensibile rilevato. Il prompt è già pronto così com è.';
        if (response.riskSummary.lowConfidenceCount > 0) {
          nextMessage = `${nextMessage} Le rilevazioni più prudenti sono state gestite automaticamente.`;
        }
        if (fileNotes.length > 0) {
          nextMessage = `${nextMessage} ${fileNotes.join(' ')}`;
        } else if (context.hasFiles) {
          nextMessage = `${nextMessage} Gli allegati presenti restano originali: per ora proteggiamo solo il testo del prompt.`;
        }
        setStatus('ready', nextMessage, {
          replacementCount: state.replacementCount,
          autoHideMs: 2800,
        });
      },
    });

    const stopSubmitGuard = registerSubmitGuard({
      adapter,
      getState: async () => {
        await syncRuntimeContext();
        return getSessionState(currentScope.sessionKey);
      },
      onAutoSanitize: async ({ verdict }) =>
        runAutomaticComposerSanitization(verdict),
      onBlocked: (verdict) => {
        setStatus('blocked', messageForBlockedSubmit(verdict));
      },
    });

    const stopResponseOverlay = registerResponseOverlay({
      adapter,
      getState: async () => {
        await syncRuntimeContext();
        return getSessionState(currentScope.sessionKey);
      },
      enabled: async () => (await getSettings()).enableResponseRehydration,
    });

    const attachmentObserver = new MutationObserver(() => {
      void syncNativeAttachmentRisk();
    });
    attachmentObserver.observe(rootParent, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-testid', 'aria-label', 'title', 'hidden'],
    });
    void syncNativeAttachmentRisk();

    const healthInterval = ctx.setInterval(() => {
      void (async () => {
        try {
          await syncRuntimeContext();
          await health();
          await patchSessionState(currentScope.sessionKey, {
            engineHealthy: true,
          });
        } catch {
          await patchSessionState(currentScope.sessionKey, {
            engineHealthy: false,
          });
        }
      })();
    }, 5000);

    let isCleanedUp = false;
    const cleanup = () => {
      if (isCleanedUp) {
        return;
      }
      isCleanedUp = true;
      stopPasteInterceptor();
      stopSubmitGuard();
      stopResponseOverlay();
      attachmentObserver.disconnect();
      window.clearInterval(healthInterval);
      clearStatusTimer();
      statusRoot.root.unmount();
      statusRoot.host.remove();
    };

    ctx.onInvalidated(cleanup);
    ctx.addEventListener(window, 'pagehide', cleanup, { once: true });

    const composer = adapter.findComposer();
    if (composer && !adapter.getComposerText()) {
      statusMode = 'idle';
      statusMessage = `Pronto per anonimizzare il prossimo incolla in ${runtimeContext.conversationId}`;
      statusVisible = false;
      render();
    }
  },
});
