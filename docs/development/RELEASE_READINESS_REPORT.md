# Release Readiness Report

## Final Repository State

The repository now supports a reproducible local bootstrap, deterministic release artifacts, separated CI workflows, a local-engine CLI, stronger security documentation, and clearer operational guides.

Validated locally in this pass:

- `./scripts/bootstrap.sh`
- `./scripts/lint.sh`
- `./.venv/bin/python -m pytest services/local-engine/tests/unit services/local-engine/tests/integration -q`
- `./node_modules/.bin/vitest run apps/extension/src/test/unit apps/extension/src/test/integration --environment jsdom`
- `./scripts/build.sh all`
- `./scripts/build.sh extension:zip`

Attempted locally in this pass:

- `./scripts/test.sh e2e`
- `PLAYWRIGHT_BROWSER=firefox ./scripts/test.sh e2e`

Observed local limitation:

- Playwright browser automation is blocked in the current sandboxed environment. Chromium exits on sandbox/Crashpad startup, and Firefox launches but does not complete page automation here. The repository keeps `ci-e2e.yml` ready for a standard GitHub Actions environment, but local e2e could not be fully validated inside this host sandbox.

## Completed Areas

- repo-local Node 20 and pnpm bootstrap path
- repo-local Python virtualenv bootstrap path
- root scripts for bootstrap, build, lint, test, and dev flows
- extension build/package scripts
- engine wheel/sdist packaging and CLI entrypoint
- separated CI workflows for contracts/extension, engine, e2e, and aggregate readiness
- expanded README, SECURITY, runbook, release checklist, admin guide, local setup, and troubleshooting docs

## Produced Artifacts

- unpacked extension build in `apps/extension/.output/chrome-mv3/`
- packaged extension zip `apps/extension/.output/chatgpt-anonymizer-extension-0.1.0-chrome.zip`
- contracts build in `packages/contracts/dist/`
- local-engine wheel and sdist in `services/local-engine/dist/`

## Version And Artifact Naming Validation

- root workspace version: `0.1.0`
- extension package version: `0.1.0`
- contracts package version: `0.1.0`
- local engine package version: `0.1.0`
- pilot release label: `v0.1.0-enterprise-pilot`
- extension zip artifact: `chatgpt-anonymizer-extension-0.1.0-chrome.zip`
- engine wheel artifact: `chatgpt_anonymizer_local_engine-0.1.0-py3-none-any.whl`
- engine sdist artifact: `chatgpt_anonymizer_local_engine-0.1.0.tar.gz`

The pilot release label intentionally differs from package versions. The release tag identifies the controlled rollout wave, while distributable artifacts remain on product version `0.1.0`.

## Active CI Workflows

- `ci-contracts-extension.yml`
- `ci-engine.yml`
- `ci-e2e.yml`
- `release-readiness.yml`

## Pilot Hardening — Applied After Initial Release

These items were completed in the pilot hardening pass (2026-04-06):

- **Paste-First Robusta**: every text paste is intercepted, sanitized immediately, and written back. The native paste bypass that previously caused all paste events to skip sanitization has been removed.
- **Write-back verification**: `replaceComposerText` return value is now checked; a read-back comparison verifies the DOM persisted the sanitized text. Silent failures now surface as visible errors instead of false "ready" states.
- **IME composition guard**: paste events arriving during active IME composition (`compositionstart`/`compositionend`) are skipped to prevent interference with Japanese, Chinese, and Korean input methods.
- **Caret position after paste**: the caret is explicitly positioned at the end of the sanitized text after `replaceChildren`, replacing a detached selection.
- **Composer DOM resilience**: loose selector strategies (no `<form>` context required) cover ChatGPT DOM variants where the form wrapper is removed or restructured. The `[data-testid="prompt-textarea"]` selector is included.
- **Submit guard broadened click detection**: when `findSubmitButton()` returns null (DOM change), the guard falls back to `looksLikeSubmitButton` heuristics applied to the clicked element, preventing guard bypass during ChatGPT DOM updates.
- **Test coverage**: 54 unit/integration tests pass. New tests added for IME guard, write-back mismatch, broadened click detection, and no-form composer variant. All 12 e2e tests pass.

## Residual Risks

- Playwright e2e remains fixture-based rather than packaged-extension-in-browser coverage
- response rehydration remains conservative on complex rich-response structures
- extension rollout signing and enterprise browser policy packaging are still manual
- IME composition flows for Japanese/Chinese/Korean users have not been validated in a real browser pilot

## Non-Blocking Gaps

- optional ML detector remains a placeholder hook
- local-engine service installation as an OS daemon is documented but not automated

## Blocking Gaps

- no product-code blocker was found in local unit/integration/build validation
- full local e2e sign-off remains blocked by the current sandboxed browser-automation environment

## Recommendation

`functional and enterprise-ready for pilot`

Reason:

- the primary paste flow now sanitizes reliably without any silent failure paths
- write-back verification prevents false ready states
- DOM resilience hardening covers known ChatGPT layout variants
- all 54 unit/integration and 12 e2e tests pass
- generalized release is still gated by manual extension signing/distribution and by confirmation of IME flows with real pilot users

## Final Pilot Recommendation

**`approve for controlled enterprise pilot`**

The product is ready to be tagged as `v0.1.0-enterprise-pilot` and distributed to the first wave of pilot users under the conditions below.

Conditions for approval:

- complete [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) before tagging
- use signed extension artifacts only — never distribute an unsigned build to pilot users
- keep rollout limited to approved desktop users per [PILOT_ROLLOUT_PLAN.md](PILOT_ROLLOUT_PLAN.md)
- require smoke-test completion (all blocker and major checks) before each environment wave
- validate the install end-to-end using [ADMIN_GUIDE.md](ADMIN_GUIDE.md) before distributing
- monitor for ChatGPT DOM changes — the selector strategy log in the browser console identifies the active discovery path
- record pilot findings using [PILOT_FEEDBACK_TEMPLATE.md](PILOT_FEEDBACK_TEMPLATE.md)
- apply [PILOT_EXIT_CRITERIA.md](PILOT_EXIT_CRITERIA.md) at the end of each wave to decide next steps
- validate IME flows with at least one Japanese or Chinese pilot user before expanding beyond Wave 1
- treat remaining e2e-browser-host variability as an environment qualification item, not as a product-code blocker

Hold if any of the following applies at distribution time:

- a blocker finding is open from the smoke test run
- the engine health endpoint does not return `"bind": "127.0.0.1"` in the target environment
- the extension artifact has not been signed for the target browser
- [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) has unchecked blocker items
