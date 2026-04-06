export type ComposerElement = HTMLElement | HTMLTextAreaElement;
export type ComposerKind = 'contenteditable' | 'textarea';

export interface ComposerDiscovery {
  composer: ComposerElement;
  kind: ComposerKind;
  strategy: string;
  fingerprint: string;
  form: HTMLFormElement | null;
  submitButton: HTMLButtonElement | null;
  attachmentCandidates: HTMLElement[];
}

type SelectorStrategy = {
  selector: string;
  strategy: string;
};

const COMPOSER_DISCOVERY_STRATEGIES: SelectorStrategy[] = [
  // Strict strategies with form context (highest confidence).
  {
    selector: 'main form [contenteditable="true"][role="textbox"]',
    strategy: 'semantic:contenteditable-role',
  },
  {
    selector: 'main form [contenteditable="true"][aria-multiline="true"]',
    strategy: 'semantic:contenteditable-multiline',
  },
  {
    selector:
      'main form [data-testid="composer-root"] [contenteditable="true"]',
    strategy: 'testid:composer-root',
  },
  {
    selector: 'main form [data-testid*="composer" i] [contenteditable="true"]',
    strategy: 'testid:composer-nested',
  },
  {
    selector: 'main form textarea[aria-label*="message" i]',
    strategy: 'textarea:aria-label',
  },
  {
    selector: 'main form textarea[aria-label*="messaggio" i]',
    strategy: 'textarea:aria-label-it',
  },
  {
    selector: 'main form textarea[placeholder*="message" i]',
    strategy: 'textarea:placeholder',
  },
  {
    selector: 'main form textarea[placeholder*="messaggio" i]',
    strategy: 'textarea:placeholder-it',
  },
  {
    selector: 'main form textarea',
    strategy: 'textarea:generic',
  },
  // Loose strategies without strict form context — used as fallback when
  // ChatGPT removes or restructures the <form> wrapper.
  {
    selector: '[data-testid="prompt-textarea"]',
    strategy: 'testid:prompt-textarea',
  },
  {
    selector: 'main [contenteditable="true"][role="textbox"]',
    strategy: 'semantic:contenteditable-role-loose',
  },
  {
    selector: 'main [contenteditable="true"][aria-multiline="true"]',
    strategy: 'semantic:contenteditable-multiline-loose',
  },
  {
    selector: 'main [data-testid="composer-root"] [contenteditable="true"]',
    strategy: 'testid:composer-root-loose',
  },
];

const SUBMIT_DISCOVERY_STRATEGIES: SelectorStrategy[] = [
  {
    selector: 'button[data-testid="send-button"]',
    strategy: 'submit:testid',
  },
  {
    selector: 'button[aria-label*="send" i]',
    strategy: 'submit:aria-label',
  },
  {
    selector: 'button[aria-label*="invia" i]',
    strategy: 'submit:aria-label-it',
  },
  {
    selector: 'button[type="submit"]',
    strategy: 'submit:form-default',
  },
  // Loose fallbacks when ChatGPT renders the send button without <button> tag
  // or without the standard type attribute.
  {
    selector: '[data-testid="send-button"]',
    strategy: 'submit:testid-loose',
  },
  {
    selector: 'button[data-testid*="send" i]',
    strategy: 'submit:testid-partial',
  },
];

const ATTACHMENT_DISCOVERY_STRATEGIES: SelectorStrategy[] = [
  {
    selector: 'main form [data-testid*="attachment" i]',
    strategy: 'attachment:testid',
  },
  {
    selector: 'main form [data-testid*="preview" i]',
    strategy: 'attachment:preview',
  },
  {
    selector: 'main form [data-testid*="uploaded" i]',
    strategy: 'attachment:uploaded',
  },
  {
    selector: 'main form [aria-label*="attachment" i]',
    strategy: 'attachment:aria-label',
  },
  {
    selector: 'main form [aria-label*="allegat" i]',
    strategy: 'attachment:aria-label-it',
  },
  {
    selector: 'main form [title*="."]',
    strategy: 'attachment:title-filename',
  },
];

export const ASSISTANT_RESPONSE_SELECTORS = [
  'main [data-message-author-role="assistant"]',
  'main article[data-testid*="assistant"]',
  'main article',
];

const ATTACHMENT_KEYWORD_PATTERN =
  /\b(?:attachment|attachments|allegato|allegati|uploaded file|uploaded image|file preview|document preview|preview allegato)\b/i;
const FILE_NAME_PATTERN =
  /\b[\w(), .-]+\.(?:pdf|txt|csv|tsv|json|xml|md|markdown|docx?|xlsx?|pptx?|png|jpe?g|gif|webp|svg|zip|rar|7z|log|yaml|yml|sql|py|ts|tsx|js|jsx|css|html?|mp3|wav|mp4|mov)\b/i;

function isVisible(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const style = globalThis.getComputedStyle?.(element);
  if (style?.display === 'none' || style?.visibility === 'hidden') {
    return false;
  }

  return !element.hasAttribute('hidden');
}

function hasMessageHint(value: string | null | undefined): boolean {
  const normalized = value?.toLowerCase() ?? '';
  return (
    normalized.includes('message') ||
    normalized.includes('messaggio') ||
    normalized.includes('prompt')
  );
}

function scoreComposerCandidate(element: ComposerElement): number {
  let score = 0;
  if (element instanceof HTMLTextAreaElement) {
    score += 35;
    if (element.getAttribute('aria-label')) {
      score += 10;
    }
    if (element.placeholder) {
      score += 5;
    }
  } else {
    score += 30;
    if (element.getAttribute('role') === 'textbox') {
      score += 15;
    }
    if (element.getAttribute('aria-multiline') === 'true') {
      score += 10;
    }
    if (element.dataset.testid?.toLowerCase().includes('composer')) {
      score += 8;
    }
  }

  if (element.closest('form')) {
    score += 20;
  }
  if (element.closest('main')) {
    score += 12;
  }
  if (hasMessageHint(element.getAttribute('aria-label'))) {
    score += 8;
  }
  if (hasMessageHint(element.getAttribute('placeholder'))) {
    score += 5;
  }

  return score;
}

function dedupeElements(elements: ComposerElement[]): ComposerElement[] {
  const seen = new Set<ComposerElement>();
  const unique: ComposerElement[] = [];
  for (const element of elements) {
    if (seen.has(element)) {
      continue;
    }
    seen.add(element);
    unique.push(element);
  }
  return unique;
}

function buildNodePath(element: Element): string {
  const segments: string[] = [];
  let cursor: Element | null = element;
  while (cursor && segments.length < 5) {
    const tag = cursor.tagName.toLowerCase();
    const siblings = cursor.parentElement
      ? Array.from(cursor.parentElement.children).filter(
          (child) => child.tagName === cursor?.tagName,
        )
      : [];
    const index = siblings.indexOf(cursor) + 1;
    segments.unshift(`${tag}:${index}`);
    cursor = cursor.parentElement;
  }
  return segments.join('>');
}

export function buildComposerFingerprint(
  element: ComposerElement,
  strategy: string,
): string {
  const parts = [
    strategy,
    element.tagName.toLowerCase(),
    element.getAttribute('role') ?? '',
    element.getAttribute('contenteditable') ?? '',
    element.getAttribute('aria-label') ?? '',
    element.getAttribute('placeholder') ?? '',
    element.getAttribute('data-testid') ??
      element.parentElement?.getAttribute('data-testid') ??
      '',
    buildNodePath(element),
  ];
  return parts.join('|');
}

export function looksLikeComposer(
  element: Element | null,
): element is ComposerElement {
  if (!isVisible(element)) {
    return false;
  }

  if (
    element instanceof HTMLTextAreaElement &&
    !element.disabled &&
    !element.readOnly
  ) {
    return true;
  }

  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const editable = element.getAttribute('contenteditable') === 'true';
  if (!editable) {
    return false;
  }

  const role = element.getAttribute('role') === 'textbox';
  const multiline = element.getAttribute('aria-multiline') === 'true';
  const labeled = Boolean(
    element.getAttribute('aria-label') || element.getAttribute('placeholder'),
  );
  return role || multiline || labeled || element.closest('form') !== null;
}

export function looksLikeSubmitButton(
  element: Element | null,
): element is HTMLButtonElement {
  if (!(element instanceof HTMLButtonElement) || element.disabled) {
    return false;
  }

  const label = `${element.getAttribute('aria-label') ?? ''} ${
    element.textContent ?? ''
  }`.toLowerCase();
  const testid = (element.dataset.testid ?? '').toLowerCase();
  return (
    element.type === 'submit' ||
    label.includes('send') ||
    label.includes('invia') ||
    testid.includes('send')
  );
}

function buildAttachmentHaystack(element: HTMLElement): string {
  return [
    element.getAttribute('data-testid') ?? '',
    element.getAttribute('aria-label') ?? '',
    element.getAttribute('title') ?? '',
    element.textContent ?? '',
  ]
    .join(' ')
    .toLowerCase();
}

export function looksLikeNativeAttachment(
  element: Element | null,
): element is HTMLElement {
  if (!isVisible(element) || !(element instanceof HTMLElement)) {
    return false;
  }

  if (element instanceof HTMLButtonElement && looksLikeSubmitButton(element)) {
    return false;
  }

  if (
    element instanceof HTMLInputElement &&
    element.type.toLowerCase() === 'file'
  ) {
    return false;
  }

  if (looksLikeComposer(element)) {
    return false;
  }

  const haystack = buildAttachmentHaystack(element);
  if (!haystack.trim()) {
    return false;
  }

  return (
    FILE_NAME_PATTERN.test(haystack) ||
    ATTACHMENT_KEYWORD_PATTERN.test(haystack)
  );
}

function findSubmitButtonNearComposer(
  root: ParentNode,
  form: HTMLFormElement | null,
): HTMLButtonElement | null {
  const searchRoot = form ?? root;

  for (const entry of SUBMIT_DISCOVERY_STRATEGIES) {
    const candidate = searchRoot.querySelector(entry.selector);
    if (looksLikeSubmitButton(candidate)) {
      return candidate;
    }
  }

  for (const candidate of searchRoot.querySelectorAll('button')) {
    if (looksLikeSubmitButton(candidate)) {
      return candidate as HTMLButtonElement;
    }
  }

  return null;
}

function findAttachmentCandidatesNearComposer(
  root: ParentNode,
  form: HTMLFormElement | null,
): HTMLElement[] {
  const searchRoot = form ?? root;
  const candidates: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();

  for (const entry of ATTACHMENT_DISCOVERY_STRATEGIES) {
    for (const candidate of searchRoot.querySelectorAll(entry.selector)) {
      if (
        candidate instanceof HTMLElement &&
        looksLikeNativeAttachment(candidate) &&
        !seen.has(candidate)
      ) {
        seen.add(candidate);
        candidates.push(candidate);
      }
    }
  }

  for (const candidate of searchRoot.querySelectorAll(
    '[title], [aria-label], [data-testid], a, button, div, li, span',
  )) {
    if (
      candidate instanceof HTMLElement &&
      looksLikeNativeAttachment(candidate) &&
      !seen.has(candidate)
    ) {
      seen.add(candidate);
      candidates.push(candidate);
    }
  }

  return candidates
    .sort(
      (left, right) =>
        left.querySelectorAll('*').length - right.querySelectorAll('*').length,
    )
    .filter(
      (candidate, index, all) =>
        !all.some(
          (other, otherIndex) =>
            otherIndex !== index && other.contains(candidate),
        ),
    );
}

export function discoverComposer(
  root: Document | HTMLElement,
): ComposerDiscovery | null {
  const strategyMatches: Array<{
    element: ComposerElement;
    strategy: string;
  }> = [];

  for (const entry of COMPOSER_DISCOVERY_STRATEGIES) {
    for (const candidate of root.querySelectorAll(entry.selector)) {
      if (looksLikeComposer(candidate)) {
        strategyMatches.push({
          element: candidate as ComposerElement,
          strategy: entry.strategy,
        });
      }
    }
  }

  for (const candidate of root.querySelectorAll(
    'textarea, [contenteditable="true"], [role="textbox"]',
  )) {
    if (looksLikeComposer(candidate)) {
      strategyMatches.push({
        element: candidate as ComposerElement,
        strategy: 'heuristic:fallback-query',
      });
    }
  }

  const ranked = dedupeElements(strategyMatches.map((entry) => entry.element))
    .map((element) => {
      const firstMatch =
        strategyMatches.find((entry) => entry.element === element)?.strategy ??
        'heuristic:fallback-query';
      return {
        element,
        strategy: firstMatch,
        score: scoreComposerCandidate(element),
      };
    })
    .sort((left, right) => right.score - left.score);

  const best = ranked[0];
  if (!best) {
    return null;
  }

  const form = best.element.closest('form');
  return {
    composer: best.element,
    kind:
      best.element instanceof HTMLTextAreaElement
        ? 'textarea'
        : 'contenteditable',
    strategy: best.strategy,
    fingerprint: buildComposerFingerprint(best.element, best.strategy),
    form: form instanceof HTMLFormElement ? form : null,
    submitButton: findSubmitButtonNearComposer(
      root,
      form instanceof HTMLFormElement ? form : null,
    ),
    attachmentCandidates: findAttachmentCandidatesNearComposer(
      root,
      form instanceof HTMLFormElement ? form : null,
    ),
  };
}

export function findAssistantCandidates(root: ParentNode): HTMLElement[] {
  const seen = new Set<HTMLElement>();
  const candidates: HTMLElement[] = [];
  for (const selector of ASSISTANT_RESPONSE_SELECTORS) {
    for (const node of root.querySelectorAll(selector)) {
      if (node instanceof HTMLElement && isVisible(node) && !seen.has(node)) {
        seen.add(node);
        candidates.push(node);
      }
    }
  }
  return candidates;
}
