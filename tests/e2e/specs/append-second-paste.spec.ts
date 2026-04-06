import { expect, test } from '@playwright/test';

import {
  installHarness,
  openFixture,
  pasteText,
  submitComposer,
} from '../fixtures/extensionHarness';

test('accoda un secondo incolla invece di sovrascrivere il primo', async ({
  page,
}) => {
  await openFixture(page, 'chatgpt-like.html');
  await installHarness(page, {
    sanitize: async ({ text }) => ({
      sanitizedText: text
        .replace('user@example.com', '[EMAIL_001]')
        .replace('+39 347 555 0101', '[PHONE_001]'),
      findings: [
        {
          id: 'finding-email',
          originalText: 'user@example.com',
          placeholder: '[EMAIL_001]',
        },
        {
          id: 'finding-phone',
          originalText: '+39 347 555 0101',
          placeholder: '[PHONE_001]',
        },
      ].filter((finding) => text.includes(finding.originalText)),
      replacements: [
        {
          findingId: 'finding-email',
          start: 6,
          end: 22,
          placeholder: '[EMAIL_001]',
        },
        {
          findingId: 'finding-phone',
          start: 6,
          end: 22,
          placeholder: '[PHONE_001]',
        },
      ].slice(0, text.includes('+39 347 555 0101') ? 2 : 1),
      riskSummary: { reviewRequired: false },
    }),
  });

  await pasteText(page, '#composer', 'Email user@example.com');
  await pasteText(page, '#composer', 'Phone +39 347 555 0101');

  await expect(page.locator('#composer')).toContainText(
    'Email user@example.com\n\nPhone +39 347 555 0101',
  );
  await submitComposer(page);
  await expect(page.locator('#composer')).toContainText(
    'Email [EMAIL_001]\n\nPhone [PHONE_001]',
  );
});
