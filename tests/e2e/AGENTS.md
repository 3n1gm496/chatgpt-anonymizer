# Module Ownership

Owns fixture-based browser workflow verification with Playwright.

## Local Commands

- headless: `pnpm --filter @chatgpt-anonymizer/e2e test`
- Firefox fallback: `PLAYWRIGHT_BROWSER=firefox pnpm --filter @chatgpt-anonymizer/e2e test`
- headed: `pnpm --filter @chatgpt-anonymizer/e2e test:headed`

## Responsibility Boundaries

- validate end-user flows for paste sanitize, edit-after-sanitize blocking, engine-down blocking, low-confidence review, and response rehydration
- keep fixtures realistic for ChatGPT-like form structure and assistant response layout
- keep the localhost engine mocked deterministically inside the harness

## Known Fragilities

- these tests validate workflow contracts, not a packaged extension loaded into a browser profile
- fixture realism must keep pace with selector and adapter changes
- some local Linux sandbox environments block Chromium automation; use the documented Firefox fallback only for local verification, not as a silent CI default

## Do Not Touch From Here

- do not add live network dependencies
- do not rely on brittle sleeps where deterministic DOM signals exist
- do not move product logic into the test harness just to make tests pass

## Minimum Tests Before Merge

- paste sanitize success
- edit-after-sanitize blocking
- engine-down blocking
- low-confidence review flow
- response rehydration toggle

## Release Rules

- Playwright report and traces must remain uploadable on CI failure
- fixture changes that justify selector fallbacks should be documented in the corresponding adapter change
