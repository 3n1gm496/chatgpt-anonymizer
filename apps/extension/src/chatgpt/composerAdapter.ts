import { normalizeLineBreaks } from '../lib/richText';
import {
  discoverComposer,
  findAssistantCandidates,
  type ComposerDiscovery,
  type ComposerElement,
} from './selectors';

function dispatchTextInput(element: ComposerElement): void {
  element.dispatchEvent(
    new InputEvent('input', { bubbles: true, composed: true }),
  );
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

const BLOCK_TAGS = new Set(['DIV', 'P', 'LI', 'PRE']);

function readEditableNode(node: Node): string {
  if (node instanceof Text) {
    return node.data;
  }

  if (!(node instanceof HTMLElement)) {
    return '';
  }

  if (node.tagName === 'BR') {
    return '\n';
  }

  const content = Array.from(node.childNodes).map(readEditableNode).join('');
  if (BLOCK_TAGS.has(node.tagName)) {
    return `${content}\n`;
  }
  return content;
}

function readContentEditableText(element: HTMLElement): string {
  const fromDomTree = Array.from(element.childNodes)
    .map(readEditableNode)
    .join('');
  const normalizedTreeText = normalizeLineBreaks(fromDomTree).replace(
    /\n+$/,
    '',
  );
  if (normalizedTreeText) {
    return normalizedTreeText;
  }

  return normalizeLineBreaks(element.innerText || element.textContent || '');
}

function buildEditableBlocks(text: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const lines = normalizeLineBreaks(text).split('\n');
  for (const line of lines) {
    const block = document.createElement('div');
    if (line.length === 0) {
      block.append(document.createElement('br'));
    } else {
      block.append(line);
    }
    fragment.append(block);
  }

  if (!fragment.childNodes.length) {
    fragment.append(document.createElement('br'));
  }

  return fragment;
}

function readComposer(discovery: ComposerDiscovery | null): string {
  if (!discovery) {
    return '';
  }

  if (discovery.composer instanceof HTMLTextAreaElement) {
    return normalizeLineBreaks(discovery.composer.value);
  }

  return readContentEditableText(discovery.composer);
}

function clearComposer(discovery: ComposerDiscovery | null): boolean {
  if (!discovery) {
    return false;
  }

  if (discovery.composer instanceof HTMLTextAreaElement) {
    discovery.composer.value = '';
    dispatchTextInput(discovery.composer);
    return true;
  }

  return writeComposer('', discovery);
}

function replaceContentEditableText(
  element: HTMLElement,
  text: string,
): boolean {
  element.focus();

  const selection = element.ownerDocument.defaultView?.getSelection?.() ?? null;
  if (selection) {
    const range = element.ownerDocument.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  const execCommand = element.ownerDocument.execCommand?.bind(
    element.ownerDocument,
  );
  if (execCommand && selection) {
    try {
      const replaceRange = element.ownerDocument.createRange();
      replaceRange.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(replaceRange);
      execCommand('insertText', false, text);
      dispatchTextInput(element);
      if (readContentEditableText(element) === normalizeLineBreaks(text)) {
        return true;
      }
    } catch {
      // Fall back to direct DOM replacement below.
    }
  }

  element.replaceChildren(buildEditableBlocks(text));
  dispatchTextInput(element);
  // After replaceChildren the selection is detached; place caret at end explicitly.
  const endSel = element.ownerDocument.defaultView?.getSelection?.() ?? null;
  if (endSel) {
    try {
      const endRange = element.ownerDocument.createRange();
      endRange.selectNodeContents(element);
      endRange.collapse(false);
      endSel.removeAllRanges();
      endSel.addRange(endRange);
    } catch {
      // Caret positioning is best-effort; the write itself succeeded.
    }
  }
  return true;
}

function writeComposer(
  text: string,
  discovery: ComposerDiscovery | null,
): boolean {
  if (!discovery) {
    return false;
  }

  discovery.composer.focus();
  if (discovery.composer instanceof HTMLTextAreaElement) {
    discovery.composer.value = text;
    dispatchTextInput(discovery.composer);
    return true;
  }

  return replaceContentEditableText(discovery.composer, text);
}

export function deriveConversationIdFromLocation(
  locationLike: Pick<Location, 'pathname'> = window.location,
): string {
  const match = locationLike.pathname.match(/\/c\/([^/?#]+)/);
  return match ? `chat:${match[1]}` : 'chat:new';
}

export function createComposerAdapter(root: Document = document) {
  function discover(): ComposerDiscovery | null {
    return discoverComposer(root);
  }

  function containsComposerTarget(target: EventTarget | null): boolean {
    const current = discover();
    return Boolean(
      current?.composer &&
      target instanceof Node &&
      current.composer.contains(target),
    );
  }

  function submit(current = discover()): boolean {
    if (!current) {
      return false;
    }

    if (current.submitButton) {
      current.submitButton.click();
      return true;
    }

    if (current.form) {
      current.form.requestSubmit();
      return true;
    }

    return false;
  }

  return {
    clearComposer: () => clearComposer(discover()),
    containsComposerTarget,
    discoverComposer: discover,
    findComposer: () => discover()?.composer ?? null,
    getNativeAttachmentCount: () =>
      discover()?.attachmentCandidates.length ?? 0,
    hasNativeAttachments: () =>
      (discover()?.attachmentCandidates.length ?? 0) > 0,
    findSubmitButton: () => discover()?.submitButton ?? null,
    focusComposer: () => discover()?.composer.focus(),
    getAssistantResponses: () => findAssistantCandidates(root),
    getComposerFingerprint: () => discover()?.fingerprint ?? null,
    getComposerText: () => readComposer(discover()),
    getConversationId: () => deriveConversationIdFromLocation(window.location),
    readComposer: () => readComposer(discover()),
    replaceComposerText: (text: string) => writeComposer(text, discover()),
    submit,
    writeComposer: (text: string) => writeComposer(text, discover()),
  };
}

export type ComposerAdapter = ReturnType<typeof createComposerAdapter>;
