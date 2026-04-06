import { expect, test } from '@playwright/test';

import {
  installHarness,
  openFixture,
  setComposerText,
  submitComposer,
} from '../fixtures/extensionHarness';

test('allows submit for a manual prompt that was never sanitized', async ({
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
    health: async () => ({ ok: false }),
  });

  await setComposerText(
    page,
    '#composer',
    'Scrivimi un riassunto del capitolo 3.',
  );
  await submitComposer(page);

  await expect(page.locator('#status')).toHaveText('submitted');
});
