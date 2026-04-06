import { expect, test } from '@playwright/test';

import {
  installHarness,
  openFixture,
  setComposerText,
  submitComposer,
} from '../fixtures/extensionHarness';

test('auto-sanitizes sensitive text that was typed manually before submit', async ({
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
          start: 9,
          end: 25,
          placeholder: '[EMAIL_001]',
        },
      ],
      riskSummary: { reviewRequired: false },
    }),
  });

  await setComposerText(page, '#composer', 'Contatta user@example.com');
  await submitComposer(page);

  await expect(page.locator('#status')).toHaveText('submitted');
  await expect(page.locator('#composer')).toHaveText('Contatta [EMAIL_001]');
});
