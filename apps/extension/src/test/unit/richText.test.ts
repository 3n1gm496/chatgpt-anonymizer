import { describe, expect, it } from 'vitest';

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
