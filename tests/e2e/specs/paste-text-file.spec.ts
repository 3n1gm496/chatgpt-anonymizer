import { expect, test } from '@playwright/test';

import {
  installHarness,
  openFixture,
  pasteTextFile,
} from '../fixtures/extensionHarness';

test('extracts and sanitizes text from a pasted textual file', async ({
  page,
}) => {
  await openFixture(page, 'chatgpt-like.html');
  await installHarness(page, {
    sanitize: async ({ text }) => ({
      sanitizedText: text.replace('user@example.com', '[EMAIL_001]'),
      findings: [],
      replacements: [
        {
          findingId: 'finding-1',
          start: 10,
          end: 26,
          placeholder: '[EMAIL_001]',
        },
      ],
      riskSummary: { reviewRequired: false },
    }),
  });

  await pasteTextFile(page, '#composer', {
    name: 'payload.txt',
    type: 'text/plain',
    content: 'Contenuto user@example.com',
  });

  await expect(page.locator('#composer')).toContainText(
    'Contenuto [EMAIL_001]',
  );
  await expect(page.locator('#status')).toHaveText('ready:1');
});
