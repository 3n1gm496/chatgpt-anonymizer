import { expect, test } from '@playwright/test';

import {
  installHarness,
  openFixture,
  pasteText,
  submitComposer,
  setComposerText,
} from '../fixtures/extensionHarness';

test('allows submit when a user adds healthy text after sanitization', async ({
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
  await setComposerText(page, '#composer', 'Email [EMAIL_001]\nTicket 123456');
  await submitComposer(page);

  await expect(page.locator('#status')).toHaveText('submitted');
});
