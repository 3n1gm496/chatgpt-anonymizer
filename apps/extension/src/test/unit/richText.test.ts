import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  dataTransferContainsFiles,
  extractPlainTextFromDataTransfer,
  extractSanitizableTextFromDataTransfer,
  mergeComposerText,
} from '../../lib/richText';

describe('richText helpers', () => {
  it('adds a blank line when accodando due blocchi senza spazi finali', () => {
    expect(mergeComposerText('Prima parte', 'Seconda parte')).toBe(
      'Prima parte\n\nSeconda parte',
    );
  });

  it('detects file payloads from DataTransfer items as well as files list', () => {
    expect(
      dataTransferContainsFiles({
        files: { length: 0 },
        items: [{ kind: 'file' }],
      } as unknown as DataTransfer),
    ).toBe(true);
  });

  it('falls back to html text extraction when plain text is missing', () => {
    const extracted = extractPlainTextFromDataTransfer({
      getData: (type: string) =>
        type === 'text/html' ? '<div>Hello<br>World</div>' : '',
    } as unknown as DataTransfer);

    expect(extracted).toContain('Hello');
    expect(extracted).toContain('World');
  });

  it('extracts text from a supported textual file payload', async () => {
    const extracted = await extractSanitizableTextFromDataTransfer({
      files: [
        {
          name: 'note.txt',
          type: 'text/plain',
          size: 14,
          lastModified: 1,
          text: async () => 'Segreto locale',
        },
      ],
      items: [],
      getData: () => '',
    } as unknown as DataTransfer);

    expect(extracted.text).toContain('Segreto locale');
    expect(extracted.extractedFileCount).toBe(1);
    expect(extracted.skippedFileCount).toBe(0);
  });

  it('skips unsupported or oversized files', async () => {
    const extracted = await extractSanitizableTextFromDataTransfer({
      files: [
        {
          name: 'archive.bin',
          type: 'application/octet-stream',
          size: 10,
          lastModified: 1,
          text: async () => 'ignored',
        },
        {
          name: 'huge.txt',
          type: 'text/plain',
          size: 300_000,
          lastModified: 2,
          text: async () => 'ignored',
        },
      ],
      items: [],
      getData: () => '',
    } as unknown as DataTransfer);

    expect(extracted.text).toBe('');
    expect(extracted.extractedFileCount).toBe(0);
    expect(extracted.skippedFileCount).toBe(2);
  });
});

describe('binary file extraction (PDF / DOCX)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  function makeFile(
    name: string,
    type: string,
    size: number,
    content: ArrayBuffer = new ArrayBuffer(8),
  ): File {
    return {
      name,
      type,
      size,
      lastModified: 1,
      arrayBuffer: async () => content,
      text: async () => '',
    } as unknown as File;
  }

  function makeDataTransfer(files: File[]): DataTransfer {
    return {
      files,
      items: [],
      getData: () => '',
    } as unknown as DataTransfer;
  }

  it('extracts text from a PDF file via pdfjs-dist', async () => {
    vi.doMock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
      GlobalWorkerOptions: { workerSrc: '' },
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 2,
          getPage: async (n: number) => ({
            getTextContent: async () => ({
              items: [{ str: `Page ${n} text` }, { str: ' continued' }],
            }),
          }),
        }),
      }),
    }));

    const { extractSanitizableTextFromDataTransfer: extract } =
      await import('../../lib/richText');
    const file = makeFile('report.pdf', 'application/pdf', 1000);
    const result = await extract(makeDataTransfer([file]));

    expect(result.extractedFileCount).toBe(1);
    expect(result.skippedFileCount).toBe(0);
    expect(result.text).toContain('Page 1 text');
    expect(result.text).toContain('Page 2 text');
  });

  it('counts a password-protected PDF as skipped', async () => {
    vi.doMock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
      GlobalWorkerOptions: { workerSrc: '' },
      getDocument: () => ({
        promise: Promise.reject(
          Object.assign(new Error('Password required'), {
            name: 'PasswordException',
          }),
        ),
      }),
    }));

    const { extractSanitizableTextFromDataTransfer: extract } =
      await import('../../lib/richText');
    const file = makeFile('secret.pdf', 'application/pdf', 1000);
    const result = await extract(makeDataTransfer([file]));

    expect(result.extractedFileCount).toBe(0);
    expect(result.skippedFileCount).toBe(1);
  });

  it('counts a PDF with no text layer as skipped', async () => {
    vi.doMock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
      GlobalWorkerOptions: { workerSrc: '' },
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 1,
          getPage: async () => ({
            getTextContent: async () => ({ items: [] }),
          }),
        }),
      }),
    }));

    const { extractSanitizableTextFromDataTransfer: extract } =
      await import('../../lib/richText');
    const file = makeFile('scan.pdf', 'application/pdf', 1000);
    const result = await extract(makeDataTransfer([file]));

    expect(result.extractedFileCount).toBe(0);
    expect(result.skippedFileCount).toBe(1);
  });

  it('extracts text from a DOCX file via mammoth', async () => {
    vi.doMock('mammoth', () => ({
      extractRawText: async () => ({
        value: 'Mario Rossi ha inviato il documento.',
        messages: [],
      }),
    }));

    const { extractSanitizableTextFromDataTransfer: extract } =
      await import('../../lib/richText');
    const file = makeFile(
      'lettera.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      1000,
    );
    const result = await extract(makeDataTransfer([file]));

    expect(result.extractedFileCount).toBe(1);
    expect(result.skippedFileCount).toBe(0);
    expect(result.text).toContain('Mario Rossi');
  });

  it('counts a corrupt DOCX as skipped', async () => {
    vi.doMock('mammoth', () => ({
      extractRawText: async () => {
        throw new Error('Invalid zip');
      },
    }));

    const { extractSanitizableTextFromDataTransfer: extract } =
      await import('../../lib/richText');
    const file = makeFile(
      'bad.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      1000,
    );
    const result = await extract(makeDataTransfer([file]));

    expect(result.extractedFileCount).toBe(0);
    expect(result.skippedFileCount).toBe(1);
  });

  it('counts a DOCX with empty text layer as skipped', async () => {
    vi.doMock('mammoth', () => ({
      extractRawText: async () => ({ value: '   ', messages: [] }),
    }));

    const { extractSanitizableTextFromDataTransfer: extract } =
      await import('../../lib/richText');
    const file = makeFile(
      'empty.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      1000,
    );
    const result = await extract(makeDataTransfer([file]));

    expect(result.extractedFileCount).toBe(0);
    expect(result.skippedFileCount).toBe(1);
  });

  it('skips a PDF over the 256 KB size limit without calling the extractor', async () => {
    const getDocument = vi.fn();
    vi.doMock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
      GlobalWorkerOptions: { workerSrc: '' },
      getDocument,
    }));

    const { extractSanitizableTextFromDataTransfer: extract } =
      await import('../../lib/richText');
    const file = makeFile('big.pdf', 'application/pdf', 300_000);
    const result = await extract(makeDataTransfer([file]));

    expect(result.skippedFileCount).toBe(1);
    expect(getDocument).not.toHaveBeenCalled();
  });
});
