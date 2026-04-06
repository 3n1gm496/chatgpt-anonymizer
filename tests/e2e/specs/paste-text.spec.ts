import { expect, test } from '@playwright/test';

import {
  installHarness,
  openFixture,
  pasteText,
  submitComposer,
} from '../fixtures/extensionHarness';

test('keeps a direct paste editable and sanitizes it automatically on submit for contenteditable', async ({
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
  });

  await pasteText(page, '#composer', 'Email user@example.com');

  await expect(page.locator('#composer')).toContainText(
    'Email user@example.com',
  );
  await submitComposer(page);
  await expect(page.locator('#composer')).toContainText('Email [EMAIL_001]');
  await expect(page.locator('#status')).toHaveText('submitted');
});

test('keeps a direct paste editable and sanitizes it automatically on submit for textarea fallback', async ({
  page,
}) => {
  await openFixture(page, 'chatgpt-like-textarea.html');
  await installHarness(page, {
    sanitize: async ({ text }) => ({
      sanitizedText: text.replace('203.0.113.15', '[IPV4_001]'),
      findings: [
        {
          id: 'finding-1',
          originalText: '203.0.113.15',
          placeholder: '[IPV4_001]',
        },
      ],
      replacements: [
        {
          findingId: 'finding-1',
          start: 9,
          end: 21,
          placeholder: '[IPV4_001]',
        },
      ],
      riskSummary: { reviewRequired: false },
    }),
  });

  await pasteText(page, '#composer', 'Address: 203.0.113.15');

  await expect(page.locator('#composer')).toHaveValue('Address: 203.0.113.15');
  await submitComposer(page);
  await expect(page.locator('#composer')).toHaveValue('Address: [IPV4_001]');
  await expect(page.locator('#status')).toHaveText('submitted');
});
