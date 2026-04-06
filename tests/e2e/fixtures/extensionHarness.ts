import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Page } from '@playwright/test';

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));

type HarnessOptions = {
  sanitize: (payload: { text: string }) => Promise<{
    sanitizedText: string;
    findings: Array<{ id: string; originalText: string; placeholder: string }>;
    replacements: Array<{
      findingId: string;
      start: number;
      end: number;
      placeholder: string;
    }>;
    riskSummary: { reviewRequired: boolean };
  }>;
  health?: () => Promise<{ ok: boolean }>;
  revert?: (payload: { text: string }) => Promise<{ revertedText: string }>;
};

export async function openFixture(page: Page, fixture: string): Promise<void> {
  await page.goto(`file://${path.join(fixtureDir, fixture)}`);
}

export async function installHarness(
  page: Page,
  options: HarnessOptions,
): Promise<void> {
  await page.exposeFunction('__cgaSanitize', options.sanitize);
  await page.exposeFunction(
    '__cgaHealth',
    options.health ?? (async () => ({ ok: true })),
  );
  await page.exposeFunction(
    '__cgaRevert',
    options.revert ??
      (async (payload: { text: string }) => ({ revertedText: payload.text })),
  );

  await page.evaluate(() => {
    const composer = document.querySelector<HTMLElement>('#composer');
    const form = document.querySelector<HTMLFormElement>('#composer-form');
    const status = document.querySelector<HTMLElement>('#status');
    const drawer = document.querySelector<HTMLElement>('#review-drawer');
    const response = document.querySelector<HTMLElement>('#assistant-response');
    const rehydrateToggle =
      document.querySelector<HTMLButtonElement>('#rehydrate-toggle');

    if (
      !composer ||
      !form ||
      !status ||
      !drawer ||
      !response ||
      !rehydrateToggle
    ) {
      throw new Error('Fixture elements missing');
    }

    (window as typeof window & { __submitCount?: number }).__submitCount = 0;
    let lastSanitized = '';
    let replacementCount = 0;
    let originalResponse = response.textContent ?? '';

    const mergeComposerText = (existing: string, incoming: string) => {
      if (!existing) {
        return incoming;
      }
      if (!incoming) {
        return existing;
      }
      if (
        existing.endsWith('\n') ||
        incoming.startsWith('\n') ||
        /\s$/.test(existing) ||
        /^\s/.test(incoming)
      ) {
        return `${existing}${incoming}`;
      }
      return `${existing}\n\n${incoming}`;
    };

    const supportedTextFileExtensions = new Set([
      'txt',
      'md',
      'markdown',
      'csv',
      'tsv',
      'json',
      'xml',
      'html',
      'htm',
      'yaml',
      'yml',
      'log',
      'sql',
      'js',
      'jsx',
      'ts',
      'tsx',
      'css',
      'py',
      'java',
      'c',
      'cc',
      'cpp',
      'h',
      'hpp',
      'sh',
      'env',
      'ini',
      'toml',
    ]);

    const supportedTextFileMimeTypes = new Set([
      'application/json',
      'application/ld+json',
      'application/xml',
      'application/yaml',
      'application/x-yaml',
      'application/javascript',
      'application/x-javascript',
      'application/x-sh',
      'application/sql',
    ]);

    const fileLooksTextual = (file: File) => {
      const mimeType = file.type.trim().toLowerCase();
      if (mimeType.startsWith('text/')) {
        return true;
      }
      if (supportedTextFileMimeTypes.has(mimeType)) {
        return true;
      }
      const extension = file.name.split('.').pop()?.trim().toLowerCase();
      return Boolean(extension && supportedTextFileExtensions.has(extension));
    };

    const collectFiles = (dataTransfer: DataTransfer | null) => {
      if (!dataTransfer) {
        return [];
      }
      const files: File[] = [];
      const seen = new Set<string>();
      const register = (file: File | null) => {
        if (!file) {
          return;
        }
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (seen.has(key)) {
          return;
        }
        seen.add(key);
        files.push(file);
      };
      for (const file of Array.from(dataTransfer.files ?? [])) {
        register(file);
      }
      for (const item of Array.from(dataTransfer.items ?? [])) {
        if (item.kind !== 'file' || typeof item.getAsFile !== 'function') {
          continue;
        }
        register(item.getAsFile());
      }
      return files;
    };

    const readTransferText = async (dataTransfer: DataTransfer | null) => {
      const directText = dataTransfer?.getData('text/plain') ?? '';
      if (directText.trim()) {
        return directText;
      }
      for (const file of collectFiles(dataTransfer)) {
        if (!fileLooksTextual(file) || file.size > 256_000) {
          continue;
        }
        const text = (await file.text()).trim();
        if (text) {
          return text;
        }
      }
      return '';
    };

    const extractAddedText = (currentText: string, trackedText: string) => {
      const trackedIndex = currentText.indexOf(trackedText);
      if (trackedIndex < 0) {
        return null;
      }
      return [
        currentText.slice(0, trackedIndex),
        currentText.slice(trackedIndex + trackedText.length),
      ]
        .join(' ')
        .trim();
    };

    const containsFormattedPhoneCandidate = (text: string) =>
      Array.from(
        text.matchAll(
          /(?:(?:\+\d{1,3}[ .-]?)?(?:\(\d{2,4}\)[ .-]?)?\d(?:[ .-]?\d){5,})/g,
        ),
      ).some((match) => {
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
        const contextWindow = text.slice(
          Math.max(0, (match.index ?? 0) - 24),
          Math.min(text.length, (match.index ?? 0) + candidate.length + 24),
        );
        return (
          digits.length >= 9 &&
          /\b(?:tel|telefono|mobile|cell(?:ulare)?|contatto|whatsapp|phone|call|sms|fax)\b/i.test(
            contextWindow,
          )
        );
      });

    const deltaLooksSensitive = (text: string) => {
      if (!text.trim()) {
        return false;
      }
      return (
        /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/.test(text) ||
        /\bhttps?:\/\/[^\s<>"]+/i.test(text) ||
        /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.){1,5}[a-z]{2,}\b/i.test(
          text,
        ) ||
        containsFormattedPhoneCandidate(text) ||
        /\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(text) ||
        /\b[A-Z]{6}[0-9]{2}[A-EHLMPRST][0-9]{2}[A-Z][0-9]{3}[A-Z]\b/i.test(
          text,
        ) ||
        /\b\d{11}\b/.test(text)
      );
    };

    const readComposerText = () => {
      if (composer instanceof HTMLTextAreaElement) {
        return composer.value;
      }
      return composer.innerText || composer.textContent || '';
    };

    const writeComposerText = (value: string) => {
      if (composer instanceof HTMLTextAreaElement) {
        composer.value = value;
        return;
      }
      composer.textContent = value;
    };

    const hideReviewDrawer = () => {
      drawer.hidden = true;
      drawer.textContent = '';
    };

    const submitNow = () => {
      (window as typeof window & { __submitCount?: number }).__submitCount =
        ((window as typeof window & { __submitCount?: number }).__submitCount ??
          0) + 1;
      status.textContent = 'submitted';
    };

    const sanitizeWholeComposer = async () => {
      const currentText = readComposerText();
      const responsePayload = await (
        window as typeof window & {
          __cgaSanitize: (payload: { text: string }) => Promise<{
            sanitizedText: string;
            findings: Array<{
              id: string;
              originalText: string;
              placeholder: string;
            }>;
            replacements: Array<{
              findingId: string;
              start: number;
              end: number;
              placeholder: string;
            }>;
            riskSummary: { reviewRequired: boolean };
          }>;
        }
      ).__cgaSanitize({ text: currentText });
      writeComposerText(responsePayload.sanitizedText);
      lastSanitized = responsePayload.sanitizedText;
      replacementCount = responsePayload.replacements.length;
      hideReviewDrawer();
      status.textContent = `ready:${responsePayload.replacements.length}`;
    };

    document.addEventListener('paste', async (event) => {
      if (!(event.target instanceof Node) || !composer.contains(event.target)) {
        return;
      }
      const directText = event.clipboardData?.getData('text/plain') ?? '';
      const files = collectFiles(event.clipboardData);
      if (directText.trim() && files.length === 0) {
        event.preventDefault();
        writeComposerText(mergeComposerText(readComposerText(), directText));
        hideReviewDrawer();
        status.textContent = '';
        return;
      }

      event.preventDefault();
      const text = await readTransferText(event.clipboardData);
      const previousComposerText = readComposerText();
      const responsePayload = await (
        window as typeof window & {
          __cgaSanitize: (payload: { text: string }) => Promise<{
            sanitizedText: string;
            findings: Array<{
              id: string;
              originalText: string;
              placeholder: string;
            }>;
            replacements: Array<{
              findingId: string;
              start: number;
              end: number;
              placeholder: string;
            }>;
            riskSummary: { reviewRequired: boolean };
          }>;
        }
      ).__cgaSanitize({ text });

      const mergedComposerText = mergeComposerText(
        previousComposerText,
        responsePayload.sanitizedText,
      );
      writeComposerText(mergedComposerText);
      lastSanitized = mergedComposerText;
      replacementCount += responsePayload.replacements.length;
      status.textContent = `ready:${responsePayload.replacements.length}`;
      hideReviewDrawer();
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const currentText = readComposerText();
      if (!currentText.trim() || !lastSanitized || replacementCount === 0) {
        const healthPayload = await (
          window as typeof window & {
            __cgaHealth: () => Promise<{ ok: boolean }>;
          }
        ).__cgaHealth();
        if (healthPayload.ok) {
          await sanitizeWholeComposer();
          submitNow();
          return;
        }
        if (!deltaLooksSensitive(currentText)) {
          submitNow();
          return;
        }
        status.textContent = 'blocked:engine-down';
        return;
      }
      if (currentText === lastSanitized) {
        submitNow();
        return;
      }
      const addedText = extractAddedText(currentText, lastSanitized);
      if (addedText !== null && !deltaLooksSensitive(addedText)) {
        submitNow();
        return;
      }
      const healthPayload = await (
        window as typeof window & {
          __cgaHealth: () => Promise<{ ok: boolean }>;
        }
      ).__cgaHealth();
      if (!healthPayload.ok) {
        status.textContent = 'blocked:engine-down';
        return;
      }
      await sanitizeWholeComposer();
      submitNow();
    });

    rehydrateToggle.addEventListener('click', async () => {
      if (response.dataset.rehydrated === 'true') {
        response.textContent = originalResponse;
        response.dataset.rehydrated = 'false';
        rehydrateToggle.textContent = 'Mostra originali';
        return;
      }

      originalResponse = response.textContent ?? '';
      const result = await (
        window as typeof window & {
          __cgaRevert: (payload: { text: string }) => Promise<{
            revertedText: string;
          }>;
        }
      ).__cgaRevert({ text: response.textContent ?? '' });
      response.textContent = result.revertedText;
      response.dataset.rehydrated = 'true';
      rehydrateToggle.textContent = 'Nascondi originali';
    });
  });
}

export async function pasteText(
  page: Page,
  selector: string,
  text: string,
): Promise<void> {
  await page.locator(selector).evaluate((element, value) => {
    element.focus();
    const event = new Event('paste', {
      bubbles: true,
      cancelable: true,
      composed: true,
    }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', {
      value: {
        getData: (type: string) => (type === 'text/plain' ? value : ''),
      },
    });
    element.dispatchEvent(event);
  }, text);
}

export async function pasteTextFile(
  page: Page,
  selector: string,
  file: { name: string; type: string; content: string },
): Promise<void> {
  await page.locator(selector).evaluate((element, value) => {
    element.focus();
    const payload = new File([value.content], value.name, {
      type: value.type,
    });
    const event = new Event('paste', {
      bubbles: true,
      cancelable: true,
      composed: true,
    }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', {
      value: {
        files: [payload],
        items: [{ kind: 'file', getAsFile: () => payload }],
        getData: () => '',
      },
    });
    element.dispatchEvent(event);
  }, file);
}

export async function setComposerText(
  page: Page,
  selector: string,
  text: string,
): Promise<void> {
  await page.locator(selector).evaluate((element, value) => {
    if (element instanceof HTMLTextAreaElement) {
      element.value = value;
      return;
    }
    element.textContent = value;
  }, text);
}

export async function submitComposer(page: Page): Promise<void> {
  await page.click('#send');
}
