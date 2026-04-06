import { expect, test } from '@playwright/test';

import { installHarness, openFixture } from '../fixtures/extensionHarness';

test('rehydrates placeholders locally and can toggle back to placeholder view', async ({
  page,
}) => {
  await openFixture(page, 'chatgpt-like.html');
  await installHarness(page, {
    sanitize: async ({ text }) => ({
      sanitizedText: text,
      findings: [],
      replacements: [],
      riskSummary: { reviewRequired: false },
    }),
    revert: async ({ text }) => ({
      revertedText: text.replace('[EMAIL_001]', 'user@example.com'),
    }),
  });

  await expect(page.locator('#assistant-response')).toHaveText(
    'Response with [EMAIL_001]',
  );
  await page.click('#rehydrate-toggle');
  await expect(page.locator('#assistant-response')).toHaveText(
    'Response with user@example.com',
  );

  await page.click('#rehydrate-toggle');
  await expect(page.locator('#assistant-response')).toHaveText(
    'Response with [EMAIL_001]',
  );
});
