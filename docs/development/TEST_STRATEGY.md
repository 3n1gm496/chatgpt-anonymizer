# Test Strategy

## Test Pyramid

- Python unit tests validate crypto, encrypted store behavior, regex detection, replacement planning, and session-manager invariants.
- Python integration tests validate FastAPI endpoints and protocol behavior with an in-process test client.
- TypeScript unit tests validate submit-guard logic, review-session logic, session-store behavior, and paste sequencing.
- TypeScript integration tests validate DOM adapter behavior and response-overlay behavior in `jsdom`.
- Playwright e2e validates full user workflows against deterministic ChatGPT-like fixtures.

## What The Suites Cover

- consistent placeholder generation inside a session
- encrypted persistence roundtrip and wrong-key failure
- session expiry and cross-scope session-id protection
- composer discovery across semantic `contenteditable`, `textarea`, and nested wrapper variants
- submit blocking for stale and engine-down-recheck flows, plus pass-through for harmless manual additions
- deterministic low-confidence review application
- repeated response rehydration toggles and subtree rerender handling

## What The Suites Do Not Cover

- packaged-extension loading inside a real browser profile
- real `chatgpt.com` production DOM snapshots in CI
- file/image workflows beyond explicit warning UX, because they remain out of scope
- OS service installation behavior for the local engine
- browser-sandbox quirks of constrained local environments such as hardened WSL containers

## Anti-Flake Criteria

- prefer deterministic fixtures and harness callbacks over arbitrary sleeps
- keep browser assertions tied to concrete DOM signals such as status text, drawer visibility, or toggle labels
- avoid external network dependencies in tests
- run Playwright with limited retries and upload artifacts on failure
- allow `PLAYWRIGHT_BROWSER=firefox` as a local fallback when Chromium automation is blocked by the host environment

## Fixture Strategy

- every selector fallback should be represented by at least one realistic fixture
- fixtures should preserve real form relationships, submit affordances, assistant response containers, and multiline composer behavior
- fixture text should be synthetic and short, but structurally representative
- fixture-based e2e is accepted as workflow-contract coverage even though it is not yet bundled-extension coverage
- local Playwright execution should prefer Chromium by default and use Firefox only as an explicitly documented fallback

## CI Mapping

- `ci-contracts-extension.yml`: contracts tests, extension tests, TS lint, extension build/package
- `ci-engine.yml`: Ruff, Python unit/integration, wheel/sdist build
- `ci-e2e.yml`: Playwright browser setup and fixture-based e2e
- `release-readiness.yml`: aggregate release gate and summary
