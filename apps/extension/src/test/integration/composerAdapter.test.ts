import { beforeEach, describe, expect, it } from 'vitest';

import { createComposerAdapter } from '../../chatgpt/composerAdapter';
import { composerVariants } from '../fixtures/composerVariants';

describe('composer adapter', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it.each(composerVariants)(
    'discovers, fingerprints, reads, clears, and writes variant %s',
    ({ html, expectedText }) => {
      document.body.innerHTML = html;
      const adapter = createComposerAdapter(document);
      const discovery = adapter.discoverComposer();

      expect(discovery).not.toBeNull();
      expect(discovery?.fingerprint).toContain(discovery?.strategy ?? '');
      expect(adapter.findSubmitButton()).toBeInstanceOf(HTMLButtonElement);
      expect(adapter.getNativeAttachmentCount()).toBe(
        discovery?.attachmentCandidates.length ?? 0,
      );

      adapter.replaceComposerText(expectedText);
      expect(adapter.getComposerText()).toBe(expectedText);

      const initialFingerprint = adapter.getComposerFingerprint();
      expect(initialFingerprint).toBeTruthy();

      adapter.clearComposer();
      expect(adapter.getComposerText()).toBe('');
      expect(adapter.getComposerFingerprint()).toBe(initialFingerprint);
    },
  );

  it('changes fingerprint when the composer variant changes', () => {
    document.body.innerHTML = composerVariants[0].html;
    const adapter = createComposerAdapter(document);
    const firstFingerprint = adapter.getComposerFingerprint();

    document.body.innerHTML = composerVariants[2].html;
    const secondFingerprint = adapter.getComposerFingerprint();

    expect(firstFingerprint).not.toBe(secondFingerprint);
  });

  it('detects an attachment chip but ignores the plain upload button', () => {
    document.body.innerHTML = composerVariants[3].html;
    const adapter = createComposerAdapter(document);

    expect(adapter.hasNativeAttachments()).toBe(true);
    expect(adapter.getNativeAttachmentCount()).toBe(1);
  });
});
