# Release Notes: v0.1.0-enterprise-pilot

## Release Summary

`v0.1.0-enterprise-pilot` is the first controlled enterprise pilot release of `chatgpt-anonymizer`. It packages the MVP into a pilot-ready release with reproducible bootstrap, deterministic build outputs, local-engine packaging, operational documentation, pilot rollout guidance, and a hardening pass that makes the paste-first protection reliable and enterprise-grade.

This release does not expand product scope. It prepares the text-first, extension-first workflow for controlled pilot deployment.

## Pilot Hardening Summary (2026-04-07 — patch 2)

Three coverage gaps were closed after the initial pilot release:

- **Typed-text on-the-fly sanitization**: manually typed text is now sanitized after 1500ms idle via an input debouncer. Previously, typed text was only sanitized at submit time.
- **PDF and DOCX text extraction on paste/drop**: text content is extracted from pasted/dropped PDF files (via pdfjs-dist, no-worker) and DOCX files (via mammoth) and sent through the same sanitization pipeline as plain text.
- **Submit blocked when native ChatGPT uploads are present**: the submit guard now returns `unsafe_attachments / allowed: false` when `unsafeAttachmentsPresent` is true in session state. Previously this flag was set but never checked at submit time.

Test count after this patch: **69 TS unit/integration + 28 Python = 97 total**.

## Pilot Hardening Summary (2026-04-06 — patch 1)

The following reliability issues were identified and fixed before the pilot release:

- **Paste bypass eliminated**: every text paste is now intercepted immediately. The previous code let ordinary text paste through natively and relied on the submit guard as the primary protection path — this was unreliable when ChatGPT changed its DOM. Now the submit guard is only a safety net for manually typed text.
- **Write-back verification**: if the sanitized text fails to persist in the composer (silent `false` return or React-layer DOM reset), the extension now shows a clear error instead of a false "ready" status.
- **IME composition guard**: paste events during active IME composition (Japanese/Chinese/Korean input methods) are skipped to prevent incorrect interception.
- **Caret positioning**: the caret is correctly placed at the end of the sanitized text after a paste.
- **DOM resilience**: composer and submit button discovery now includes loose fallback strategies that work even when ChatGPT removes the `<form>` wrapper from its DOM. The submit guard also falls back to heuristic button detection when the primary discovery fails.

## Versioning And Naming

- release label: `v0.1.0-enterprise-pilot`
- repository/package version: `0.1.0`
- extension artifact: `chatgpt-anonymizer-extension-0.1.0-chrome.zip`
- engine artifact: `chatgpt_anonymizer_local_engine-0.1.0-py3-none-any.whl`
- engine source artifact: `chatgpt_anonymizer_local_engine-0.1.0.tar.gz`

The pilot label identifies the rollout wave. The shipped artifacts remain on product version `0.1.0`.

## Included In This Release

- WXT browser extension for ChatGPT Web paste sanitization
- shared localhost/runtime contracts package
- FastAPI local engine with encrypted mapping persistence
- unit and integration validation for contracts, extension, and engine
- CI workflows for contracts/extension, engine, e2e, and release readiness
- pilot-facing documentation for smoke tests, rollout, and acceptance

## Required Pilot Flows

- paste sanitization before submit (text, PDF, DOCX)
- on-the-fly sanitization of typed text (1500ms debounce)
- submit guard when engine is unreachable
- submit guard when text becomes stale after edit
- submit blocked when native ChatGPT uploads are present
- low-confidence review drawer
- local-only response rehydration toggle
- popup/session reset flow

## Distribution Artifacts

- unpacked extension directory: `apps/extension/.output/chrome-mv3/`
- extension zip: `apps/extension/.output/chatgpt-anonymizer-extension-0.1.0-chrome.zip`
- contracts build: `packages/contracts/dist/`
- engine wheel: `services/local-engine/dist/chatgpt_anonymizer_local_engine-0.1.0-py3-none-any.whl`
- engine sdist: `services/local-engine/dist/chatgpt_anonymizer_local_engine-0.1.0.tar.gz`

## Installation Notes

- install the local engine before enabling the extension for pilot users
- load the unpacked extension for internal validation, then distribute the signed zip for pilot users
- use only `http://127.0.0.1:<port>` engine endpoints
- verify smoke-test completion before opening the pilot to each new user wave

## Known Limitations

- text extraction scope: prompt text and text extracted from pasted/dropped PDF and DOCX files are protected; image files (PNG, JPEG, etc.) are not sanitized
- PDFs pasted with no text layer (scanned documents), password-protected PDFs, and corrupt DOCX files are skipped with a visible notice
- files uploaded directly through ChatGPT's native file upload button are not sanitized — submit is blocked when such files are detected, with a message asking the user to remove them
- no remote management, auth, or central mapping sync
- response rehydration remains conservative around complex rich-response layouts
- local Playwright execution may vary on sandboxed hosts even though CI workflows are prepared
- IME flows (Japanese, Chinese, Korean) have not been validated in a real browser pilot session — skipping is implemented but not user-tested
- caret position after paste lands at end of sanitized text, not at the original paste cursor position (expected behavior for an anonymization tool)
- duplicate-tab session isolation depends on browser `tabId`; `tabId = 0` fallback is weaker than the normal tab-scoped path
- the "ML detector" (`ml:local-heuristic`) is a set of regex heuristics for PERSON names, USERNAMEs, and custom IDs — it is not a neural network model; it runs on every request (`enableMl: true` is hardcoded in the extension)

## Recommended Pilot Decision

Proceed with the enterprise pilot if:

- the extension zip is signed for the target browser
- the engine package is distributed through an approved internal channel
- the smoke matrix passes in the pilot environment
- pilot participants are limited to approved desktop users
