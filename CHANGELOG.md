# Changelog

All notable changes to this repository are documented in this file.

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
