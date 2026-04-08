# Changelog

All notable changes to this repository are documented in this file.

## [v0.1.0-enterprise-pilot] - 2026-04-08 (extended detectors + hardening pass 2)

### Added

- **IPv6 detector** (`extended_detector.py`): structural pattern matching validated via `ipaddress.IPv6Address`. Covers full 8-group and compressed (`::`) notation. Confidence 0.95; never triggers review.
- **Date-of-birth detector** (`extended_detector.py`): ISO 8601, European numeric, and European long formats. Fires only when an explicit DOB keyword (`data di nascita`, `DOB`, `born on`, `nato il`, etc.) appears within 60 chars. Confidence 0.88.
- **National identifier detector** (`extended_detector.py`): EU passport format (1–2 letters + 6–9 digits) and generic alphanumeric IDs in labeled context (passport, national ID, residence permit, driver's licence, SSN, NIN). Confidence 0.82.
- **Address detector** (`extended_detector.py`): labeled-context (`indirizzo:`, `address:`, `road:`, `street:`) and inline street-type keywords (`Via`, `Viale`, `Corso`, `Piazza`, etc.). Confidence 0.72.
- **Payment card Luhn check in submit guard** (`submitGuard.ts`): `containsValidPaymentCard` validates 13–19 digit card numbers with the Luhn algorithm before blocking submit. Prevents false positives on plain numeric sequences.

### Fixed

- **Integration test used deprecated `enableMl` field** (`test_api.py`): the `SanitizeOptions` field was renamed to `enableHeuristics` in a prior session; the integration test was left on the old name, causing a 422 on the `/sanitize` endpoint. Fixed.

### Changed

- **Pseudonymization terminology corrected** across all user-visible strings and product docs: "anonimizzato/anonymization" replaced with "pseudonimizzato/pseudonymization" in `pasteInterceptor.ts`, `submitGuard.ts`, `StatusPill.tsx`, `MappingSessionCard.tsx`, `ReviewDrawer.tsx`, `App.tsx`, `README.md`, `SECURITY.md`, `PRD.md`, `UX_FLOWS.md`, `PILOT_SMOKE_TESTS.md`.

### Tests

- 30 new Python unit tests for all 4 extended detectors (IPv6, DOB, NationalId, Address)
- 4 new TS unit tests: payment card Luhn guard (valid Visa blocked, space-separated blocked, invalid Luhn allowed, below-minimum length allowed)
- Total: 92 Python unit/integration tests pass; 76 TS unit/integration tests pass
- Lint: ESLint, Prettier, Ruff all clean

## [v0.1.0-enterprise-pilot] - 2026-04-08 (security & detector hardening)

### Fixed

- **Critical: async paste/drop race** (`pasteInterceptor.ts`): `event.preventDefault()` was called after the first `await`, which let the browser deliver the raw clipboard text to the editor before sanitization completed. Fixed by moving `preventDefault()` to the synchronous portion of both `handlePaste` and `handleDrop`.
- **PARTITA_IVA false positives in submit guard** (`submitGuard.ts`): the bare `/\b\d{11}\b/` pattern flagged every 11-digit number (ticket IDs, phone numbers, order references) as a potential Partita IVA. The pattern now validates the Luhn-style modulo checksum before blocking.
- **IBAN spaced-form detection** (`financial_detector.py`): the regex pattern placed the optional space *after* each 4-char group, which prevented matching IBANs in the standard printed presentation (space between check digits and first data group, e.g. `GB82 WEST 1234 5698 7654 32`). Pattern rewritten to allow the space *before* each group.

### Added

- **IBAN detector** (`financial_detector.py`): detects IBAN codes with full MOD-97 checksum validation (ISO 13616). Country-specific length table for 60+ countries. Entity type: `IBAN`.
- **Payment card detector** (`financial_detector.py`): detects payment card numbers (PAN) using the Luhn algorithm plus BIN-prefix filtering to suppress false positives. Entity type: `PAYMENT_CARD`.
- **Secrets detector** (`secrets_detector.py`): detects developer secrets — AWS access keys, GitHub/GitLab PATs, Stripe keys, npm tokens, Google API keys, JWTs, PEM private keys, Bearer tokens, database connection strings, `.env`-style secrets, and labeled hex values. Entity type: `SECRET`.
- **Engine request authentication** (`main.py`): bearer-token middleware protects all `/sanitize`, `/revert`, and `/rotate-key` endpoints. Token is generated once at startup and surfaced through a health response so the extension can acquire it programmatically.
- **`enableHeuristics` / `heuristicsEnabled` API fields**: replaces the misleading `enableMl` / `mlEnabled` naming. Legacy names still accepted on inbound requests for backwards compatibility. Env var `LOCAL_ENGINE_ENABLE_HEURISTICS` preferred; `LOCAL_ENGINE_ENABLE_ML` still accepted.

### Changed

- **`OptionalMlDetector` → `ContextualHeuristicDetector`** (`heuristic_detector.py`): the class and its rule prefix were renamed to accurately reflect that no ML inference is performed. `ml_detector.py` is retained as a backwards-compatibility shim exporting both names.
- **`LocalAnonymizationService` → `LocalPseudonymizationService`** (`service.py`): class renamed to use correct privacy terminology. `LocalAnonymizationService` re-exported as alias.

### Tests

- 21 new Python unit tests: IBAN (MOD-97), payment card (Luhn + BIN), secrets (12 detector names), `ContextualHeuristicDetector` canonical name + shim, heuristics env-var backwards compat
- 3 new TS unit tests: PARTITA_IVA checksum regression suite (valid blocked, invalid allowed, short ticket allowed)
- Total: 72 TS unit/integration tests pass; 64 Python unit tests pass

## [v0.1.0-enterprise-pilot] - 2026-04-07 (pilot hardening patch 2)

No new API surface, no architecture changes. Three coverage gaps closed.

### Added

- **Typed-text debounce**: `registerInputDebouncer` in `pasteInterceptor.ts` sanitizes manually typed text on-the-fly with a 1500ms idle debounce. Previously, typed text was only sanitized at submit time. An `isSanitizing` reentrance flag prevents the synthetic `input` event fired by `replaceComposerText` from re-triggering the debouncer.
- **PDF and DOCX text extraction on paste/drop**: `extractTextFromPdf` (pdfjs-dist, no-worker MV3-safe) and `extractTextFromDocx` (mammoth) are added to `richText.ts` as dynamic imports. Text extracted from pasted/dropped PDF or DOCX files is sanitized and written to the composer like any other text. Password-protected, scanned, or corrupt files fall through to `skippedFileCount` with a visible notice.
- **Submit blocked when native ChatGPT uploads are present**: `deriveSubmitGuardVerdict` now returns `{ allowed: false, state: 'unsafe_attachments' }` when `sessionState.unsafeAttachmentsPresent` is true. Previously this session field was set but never checked at submit time.

### Tests

- 15 new tests: 6 for the typed-text debouncer, 7 for PDF/DOCX extraction (including password-protected PDF, corrupt DOCX, scanned PDF), 3 for the unsafe-attachments submit block
- Total: 69 TS unit/integration tests pass; 28 Python unit/integration tests pass
- Lint: ESLint, Prettier, Ruff all clean

### Artifacts

- Extension zip: `chatgpt-anonymizer-extension-0.1.0-chrome.zip` (461 KB, up from 198 KB — pdfjs-dist and mammoth loaded as lazy code-split chunks)
- Engine wheel and sdist unchanged

## [v0.1.0-enterprise-pilot] - 2026-04-06 (pilot hardening patch)

Pilot hardening pass. No new features, no architecture changes.

### Fixed

- **Paste bypass removed**: every text paste is now intercepted immediately by the extension. The previous bypass that let ordinary text paste through natively (relying on the submit guard to catch it) has been eliminated. The submit guard remains active as a safety net for manually typed text only.
- **Write-back verification**: `replaceComposerText` return value is now checked and a read-back comparison verifies the DOM persisted the sanitized text. Previously a silent `false` return or a React-layer DOM reset would leave the composer unchanged while showing a false "ready" status.
- **IME composition guard**: paste events arriving during active IME composition (`compositionstart`/`compositionend`) are now skipped to prevent interference with Japanese, Chinese, and Korean input methods.
- **Caret position after paste**: after `replaceChildren`, the caret is now explicitly positioned at the end of the sanitized text. Previously the selection was left detached.
- **Composer DOM resilience**: loose selector strategies (no `<form>` context required) cover ChatGPT DOM variants where the form wrapper is removed or restructured. The `[data-testid="prompt-textarea"]` selector is included as a loose fallback.
- **Submit guard broadened click detection**: when `findSubmitButton()` returns null due to a DOM change, the guard falls back to `looksLikeSubmitButton` heuristics applied to the clicked element. `looksLikeSubmitButton` now also checks `data-testid` containing "send".

### Tests

- new test: IME composition guard skips paste during active composition
- new test: write-back DOM mismatch throws instead of silently showing "ready"
- new tests: broadened click detection intercepts and blocks send button click when `findSubmitButton()` returns null
- new fixture variants: `no-form-contenteditable` and `prompt-textarea-testid`, both covered by the existing adapter test loop
- all 54 unit/integration tests pass; all 12 e2e tests pass

### Documentation

- `RUNBOOK.md`: Paste-First Robusta section added, triage entries for write-back errors
- `RELEASE_READINESS_REPORT.md`: pilot hardening section added, recommendation updated to `functional and enterprise-ready for pilot`
- `PRODUCT_RESCUE_PLAN.md`: session 2 FASE 8 report added

## [v0.1.0-enterprise-pilot] - 2026-04-03

Initial enterprise pilot release for the extension-first local anonymization workflow.

### Added

- reproducible local bootstrap with repo-local Node, pnpm, and Python virtualenv support
- packaged browser extension build and Python wheel/sdist build outputs
- local-engine CLI entrypoint `chatgpt-anonymizer-engine`
- operational documentation for setup, runbook, admin workflow, troubleshooting, release readiness, and pilot rollout
- explicit pilot artifacts, smoke tests, rollout plan, and pilot acceptance criteria

### Changed

- release artifact naming aligned around product version `0.1.0`
- extension packaging aligned to `chatgpt-anonymizer-extension-0.1.0-chrome.zip`
- documentation aligned to the actual extension output directory `apps/extension/.output/`
- release readiness report updated with an explicit enterprise pilot recommendation

### Security

- localhost-only processing boundary documented and preserved
- raw text logging remains prohibited across extension and engine
- encrypted local mapping persistence and local-only rehydration documented as pilot controls

### Known Pilot Caveats

- Playwright e2e is ready for CI but local browser automation can still vary in constrained sandbox environments
- extension signing and enterprise browser distribution remain manual operational steps
- file/image anonymization and broader rich-content workflows remain out of scope
