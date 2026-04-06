import { expect, test } from '@playwright/test';

import {
  installHarness,
  openFixture,
  pasteText,
  submitComposer,
  setComposerText,
} from '../fixtures/extensionHarness';

test('blocks submit when protected content changes and the local engine is down', async ({
  page,
}) => {
  await openFixture(page, 'chatgpt-like.html');
  let engineOk = true;
  await installHarness(page, {
    sanitize: async ({ text }) => ({
      sanitizedText: text.replace('user@example.com', '[EMAIL_001]'),
      findings: [
        {
          id: 'finding-1',
          originalText: 'user@example.com',
          placeholder: '[EMAIL_001]',
        },
      ],
      replacements: [
        {
          findingId: 'finding-1',
          start: 6,
          end: 22,
          placeholder: '[EMAIL_001]',
        },
      ],
      riskSummary: { reviewRequired: false },
    }),
    health: async () => ({ ok: engineOk }),
  });

  await pasteText(page, '#composer', 'Email user@example.com');
  await submitComposer(page);
  engineOk = false;
  await setComposerText(
    page,
    '#composer',
    'Email [EMAIL_001]\n\nuser@example.com',
  );
  await submitComposer(page);

  await expect(page.locator('#status')).toHaveText('blocked:engine-down');
});

test('re-sanitizes automatically when the composer changes after sanitization', async ({
  page,
}) => {
  await openFixture(page, 'chatgpt-like.html');
  await installHarness(page, {
    sanitize: async ({ text }) => ({
      sanitizedText: text.replace('user@example.com', '[EMAIL_001]'),
      findings: [
        {
          id: 'finding-1',
          originalText: 'user@example.com',
          placeholder: '[EMAIL_001]',
        },
      ],
      replacements: [
        {
          findingId: 'finding-1',
          start: 6,
          end: 22,
          placeholder: '[EMAIL_001]',
        },
      ],
      riskSummary: { reviewRequired: false },
    }),
    health: async () => ({ ok: true }),
  });

  await pasteText(page, '#composer', 'Email user@example.com');
  await submitComposer(page);
  await setComposerText(page, '#composer', 'Email changed');
  await submitComposer(page);

  await expect(page.locator('#status')).toHaveText('submitted');
  await expect(page.locator('#composer')).toHaveText('Email changed');
});
