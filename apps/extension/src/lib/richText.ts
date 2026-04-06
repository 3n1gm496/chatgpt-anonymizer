export function normalizeLineBreaks(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

const SUPPORTED_TEXT_FILE_EXTENSIONS = new Set([
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

const SUPPORTED_TEXT_FILE_MIME_TYPES = new Set([
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

const MAX_FILE_BYTES = 256_000;
const MAX_TOTAL_EXTRACTED_CHARS = 45_000;

export function mergeComposerText(existing: string, incoming: string): string {
  const normalizedExisting = normalizeLineBreaks(existing);
  const normalizedIncoming = normalizeLineBreaks(incoming);

  if (!normalizedExisting) {
    return normalizedIncoming;
  }

  if (!normalizedIncoming) {
    return normalizedExisting;
  }

  if (
    normalizedExisting.endsWith('\n') ||
    normalizedIncoming.startsWith('\n') ||
    /\s$/.test(normalizedExisting) ||
    /^\s/.test(normalizedIncoming)
  ) {
    return `${normalizedExisting}${normalizedIncoming}`;
  }

  return `${normalizedExisting}\n\n${normalizedIncoming}`;
}

export function htmlToText(html: string): string {
  const documentFragment = new DOMParser().parseFromString(html, 'text/html');
  return normalizeLineBreaks(
    documentFragment.body.innerText || documentFragment.body.textContent || '',
  );
}

export function extractPlainTextFromDataTransfer(
  dataTransfer: DataTransfer | null,
): string {
  if (!dataTransfer) {
    return '';
  }

  const plainText = dataTransfer.getData('text/plain');
  if (plainText) {
    return normalizeLineBreaks(plainText);
  }

  const html = dataTransfer.getData('text/html');
  if (html) {
    return htmlToText(html);
  }

  return '';
}

export function dataTransferContainsFiles(
  dataTransfer: DataTransfer | null,
): boolean {
  if (!dataTransfer) {
    return false;
  }

  if (dataTransfer.files.length > 0) {
    return true;
  }

  return Array.from(dataTransfer.items ?? []).some(
    (item) => item.kind === 'file',
  );
}

function isSanitizableBinaryFile(file: File): boolean {
  const mimeType = file.type.trim().toLowerCase();
  const extension = file.name.split('.').pop()?.trim().toLowerCase();
  if (mimeType === 'application/pdf' || extension === 'pdf') {
    return true;
  }
  if (
    mimeType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    extension === 'docx'
  ) {
    return true;
  }
  return false;
}

async function extractTextFromPdf(file: File): Promise<string> {
  // Dynamic import keeps pdfjs-dist out of the main content-script bundle.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjsLib = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as any;
  // Disable the worker — required for MV3 CSP compliance in a content script.
  pdfjsLib.GlobalWorkerOptions.workerSrc = '';
  const data = await file.arrayBuffer();
  const doc = await pdfjsLib
    .getDocument({
      data,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    })
    .promise.catch((err: unknown) => {
      const name =
        err instanceof Error
          ? err.constructor.name
          : ((err as { name?: string })?.name ?? '');
      if (name === 'PasswordException') {
        throw new Error(
          'Il file PDF è protetto da password e non può essere analizzato.',
        );
      }
      throw err;
    });

  const pageTexts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((item: any) => 'str' in item)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((item: any) => item.str as string)
      .join(' ');
    if (pageText.trim()) {
      pageTexts.push(pageText);
    }
  }
  return pageTexts.join('\n\n');
}

async function extractTextFromDocx(file: File): Promise<string> {
  // Dynamic import keeps mammoth out of the main content-script bundle.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mammoth = (await import('mammoth')) as any;
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return (result.value as string) ?? '';
}

function fileLooksTextual(file: File): boolean {
  const mimeType = file.type.trim().toLowerCase();
  if (mimeType.startsWith('text/')) {
    return true;
  }

  if (SUPPORTED_TEXT_FILE_MIME_TYPES.has(mimeType)) {
    return true;
  }

  const extension = file.name.split('.').pop()?.trim().toLowerCase();
  return Boolean(extension && SUPPORTED_TEXT_FILE_EXTENSIONS.has(extension));
}

function collectFilesFromDataTransfer(
  dataTransfer: DataTransfer | null,
): File[] {
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
}

export interface ExtractedTransferText {
  text: string;
  extractedFileCount: number;
  skippedFileCount: number;
  truncated: boolean;
  hadDirectText: boolean;
}

export async function extractSanitizableTextFromDataTransfer(
  dataTransfer: DataTransfer | null,
): Promise<ExtractedTransferText> {
  const directText = extractPlainTextFromDataTransfer(dataTransfer).trim();
  const parts: string[] = [];
  let totalChars = 0;
  let extractedFileCount = 0;
  let skippedFileCount = 0;
  let truncated = false;

  const pushChunk = (chunk: string) => {
    const normalizedChunk = normalizeLineBreaks(chunk).trim();
    if (!normalizedChunk || totalChars >= MAX_TOTAL_EXTRACTED_CHARS) {
      if (normalizedChunk) {
        truncated = true;
      }
      return;
    }

    const remaining = MAX_TOTAL_EXTRACTED_CHARS - totalChars;
    if (normalizedChunk.length > remaining) {
      parts.push(normalizedChunk.slice(0, remaining));
      totalChars += remaining;
      truncated = true;
      return;
    }

    parts.push(normalizedChunk);
    totalChars += normalizedChunk.length;
  };

  if (directText) {
    pushChunk(directText);
  }

  const allFiles = collectFilesFromDataTransfer(dataTransfer);
  for (const file of allFiles) {
    if (file.size > MAX_FILE_BYTES) {
      skippedFileCount += 1;
      continue;
    }

    if (fileLooksTextual(file)) {
      const rawText = await file.text();
      const normalizedFileText = normalizeLineBreaks(rawText).trim();
      if (!normalizedFileText) {
        skippedFileCount += 1;
        continue;
      }
      extractedFileCount += 1;
      const prefix =
        allFiles.length > 1 || directText
          ? `Contenuto allegato ${extractedFileCount}:\n`
          : '';
      pushChunk(`${prefix}${normalizedFileText}`);
    } else if (isSanitizableBinaryFile(file)) {
      try {
        const extracted =
          file.name.toLowerCase().endsWith('.pdf') ||
          file.type === 'application/pdf'
            ? await extractTextFromPdf(file)
            : await extractTextFromDocx(file);
        const normalizedExtracted = normalizeLineBreaks(extracted).trim();
        if (!normalizedExtracted) {
          skippedFileCount += 1;
          continue;
        }
        extractedFileCount += 1;
        const prefix =
          allFiles.length > 1 || directText
            ? `Contenuto allegato ${extractedFileCount}:\n`
            : '';
        pushChunk(`${prefix}${normalizedExtracted}`);
      } catch {
        skippedFileCount += 1;
      }
    } else {
      skippedFileCount += 1;
    }
  }

  return {
    text: parts.join('\n\n').trim(),
    extractedFileCount,
    skippedFileCount,
    truncated,
    hadDirectText: Boolean(directText),
  };
}

export function collectTextNodes(root: Node): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (
        parent?.closest(
          '.cga-response-toggle, pre, code, kbd, samp, textarea, input, button',
        )
      ) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  while (walker.nextNode()) {
    nodes.push(walker.currentNode as Text);
  }
  return nodes;
}

export function replaceTextNodes(
  root: HTMLElement,
  mapping: Map<string, string>,
  snapshot: Map<Text, string>,
): number {
  let replacements = 0;
  const replacementsByPlaceholder = [...mapping.entries()].sort(
    (left, right) => right[0].length - left[0].length,
  );
  for (const node of collectTextNodes(root)) {
    const original = node.data;
    if (original.length > 12_000) {
      continue;
    }
    let nextValue = original;
    for (const [placeholder, actual] of replacementsByPlaceholder) {
      if (!nextValue.includes(placeholder)) {
        continue;
      }
      nextValue = nextValue.split(placeholder).join(actual);
    }
    if (nextValue !== original) {
      if (!snapshot.has(node)) {
        snapshot.set(node, original);
      }
      node.data = nextValue;
      replacements += 1;
    }
  }
  return replacements;
}

export function restoreTextNodes(snapshot: Map<Text, string>): void {
  for (const [node, value] of snapshot.entries()) {
    if (node.isConnected) {
      node.data = value;
    }
  }
  snapshot.clear();
}
