import {
  collectTextNodes,
  restoreTextNodes,
  replaceTextNodes,
} from '../lib/richText';
import { revert } from '../services/localEngineClient';
import type { SanitizationState } from '../services/sessionStore';
import type { ComposerAdapter } from './composerAdapter';

interface OverlayState {
  button: HTMLButtonElement | null;
  isRehydrated: boolean;
  isSyncing: boolean;
  mapping: Map<string, string>;
  snapshot: Map<Text, string>;
}

const OVERLAY_STATES = new WeakMap<HTMLElement, OverlayState>();

function buildToggle(): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'cga-response-toggle';
  button.textContent = 'Mostra originali';
  return button;
}

function getOverlayState(container: HTMLElement): OverlayState {
  const existing = OVERLAY_STATES.get(container);
  if (existing) {
    return existing;
  }

  const initial: OverlayState = {
    button: null,
    isRehydrated: false,
    isSyncing: false,
    mapping: new Map<string, string>(),
    snapshot: new Map<Text, string>(),
  };
  OVERLAY_STATES.set(container, initial);
  return initial;
}

function readResponseText(container: HTMLElement): string {
  return collectTextNodes(container)
    .map((node) => node.data)
    .join('');
}

function updateButtonLabel(state: OverlayState): void {
  if (!state.button) {
    return;
  }
  const label = state.isRehydrated ? 'Nascondi originali' : 'Mostra originali';
  if (state.button.textContent !== label) {
    state.button.textContent = label;
  }
}

async function applyRehydration(
  container: HTMLElement,
  state: OverlayState,
  getState: () => Promise<SanitizationState | null>,
): Promise<void> {
  if (state.isSyncing) {
    return;
  }

  state.isSyncing = true;
  try {
    if (state.mapping.size === 0) {
      const sessionState = await getState();
      if (!sessionState?.sessionId) {
        return;
      }

      const result = await revert({
        protocolVersion: 'v1',
        sessionId: sessionState.sessionId,
        text: readResponseText(container),
      });
      state.mapping = new Map(
        result.replacements.map((replacement) => [
          replacement.placeholder,
          replacement.originalText,
        ]),
      );
    }

    if (state.mapping.size === 0) {
      return;
    }

    replaceTextNodes(container, state.mapping, state.snapshot);
    state.isRehydrated = true;
    container.dataset.cgaRehydrated = 'true';
    updateButtonLabel(state);
  } finally {
    state.isSyncing = false;
  }
}

function revertRehydration(container: HTMLElement, state: OverlayState): void {
  restoreTextNodes(state.snapshot);
  state.isRehydrated = false;
  container.dataset.cgaRehydrated = 'false';
  updateButtonLabel(state);
}

export function registerResponseOverlay(options: {
  adapter: Pick<ComposerAdapter, 'getAssistantResponses'>;
  getState: () => Promise<SanitizationState | null>;
  enabled: () => Promise<boolean>;
}): () => void {
  const observer = new MutationObserver(() => {
    void hydrateCandidates();
  });
  let observing = false;

  function startObserving(): void {
    if (observing) {
      return;
    }
    observer.observe(document.body, { childList: true, subtree: true });
    observing = true;
  }

  async function withObserverPaused<T>(
    action: () => Promise<T> | T,
  ): Promise<T> {
    observer.disconnect();
    observing = false;
    try {
      return await action();
    } finally {
      startObserving();
    }
  }

  async function toggle(container: HTMLElement) {
    const state = getOverlayState(container);
    if (state.isRehydrated) {
      await withObserverPaused(() => {
        revertRehydration(container, state);
      });
      return;
    }

    await withObserverPaused(() =>
      applyRehydration(container, state, options.getState),
    );
  }

  async function hydrateCandidates() {
    if (!(await options.enabled())) {
      return;
    }

    for (const container of options.adapter.getAssistantResponses()) {
      const state = getOverlayState(container);
      if (!state.button || !state.button.isConnected) {
        await withObserverPaused(() => {
          state.button = buildToggle();
          state.button.addEventListener('click', () => {
            void toggle(container);
          });
          container.prepend(state.button);
        });
      }

      if (state.isRehydrated) {
        await withObserverPaused(() =>
          applyRehydration(container, state, options.getState),
        );
      }
    }
  }

  void hydrateCandidates();
  startObserving();
  return () => observer.disconnect();
}
