import { expect, test } from '@playwright/test';

import {
  installHarness,
  openFixture,
  pasteText,
  submitComposer,
} from '../fixtures/extensionHarness';

test('allows submit when the protected prompt is unchanged even if the engine is down', async ({
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
  await submitComposer(page);

  await expect(page.locator('#status')).toHaveText('submitted');
});
