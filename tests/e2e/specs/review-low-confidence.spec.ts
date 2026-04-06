import { expect, test } from '@playwright/test';

import {
  installHarness,
  openFixture,
  pasteText,
  submitComposer,
} from '../fixtures/extensionHarness';

test('handles low-confidence replacements automatically without opening a review drawer', async ({
  page,
}) => {
  await openFixture(page, 'chatgpt-like.html');
  await installHarness(page, {
    sanitize: async ({ text }) => ({
      sanitizedText: text.replace('+39 347 555 0101', '[PHONE_001]'),
      findings: [
        {
          id: 'finding-1',
          originalText: '+39 347 555 0101',
          placeholder: '[PHONE_001]',
        },
      ],
      replacements: [
        {
          findingId: 'finding-1',
          start: 6,
          end: 22,
          placeholder: '[PHONE_001]',
        },
      ],
      riskSummary: { reviewRequired: true },
    }),
  });

  await pasteText(page, '#composer', 'Phone +39 347 555 0101');

  await expect(page.locator('#review-drawer')).toBeHidden();
  await expect(page.locator('#composer')).toContainText(
    'Phone +39 347 555 0101',
  );
  await submitComposer(page);
  await expect(page.locator('#review-drawer')).toBeHidden();
  await expect(page.locator('#composer')).toContainText('Phone [PHONE_001]');
  await expect(page.locator('#status')).toHaveText('submitted');
});
