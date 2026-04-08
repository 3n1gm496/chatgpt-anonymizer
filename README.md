# ChatGPT Anonymizer

`chatgpt-anonymizer` is an extension-first local pseudonymization product for ChatGPT Web. The browser extension intercepts pasted text before submit, sends it only to a service bound on `127.0.0.1`, replaces sensitive values inline with deterministic placeholders, stores the reversible mapping locally in encrypted form, and can optionally rehydrate known placeholders in rendered responses on the same device.

## Why This Is Different From The Old Batch Tool

- it protects the normal ChatGPT desktop browser workflow instead of an upload/batch workflow
- it removes the old SPA, queueing, batch review, reporting, and deployment-heavy architecture
- it keeps the privacy boundary on `127.0.0.1` instead of moving sensitive text to remote services
- it is optimized for iterative extension + local-engine development, testing, and controlled rollout

## Paste-First Strategy

The extension uses a **Paste-First** strategy: every time a user pastes text into the ChatGPT composer, the extension intercepts the paste event before the browser delivers the text to the editor, sends the text to the local engine for sanitization, and writes the sanitized result (with placeholders) back into the composer. The original text never appears in the editor.

The submit guard is a secondary safety net that applies to text the user types manually (not pasted). It blocks submission if a previously protected prompt has been changed in a way that requires a new local check.

This design means:
- protection happens at paste time, not at submit time
- protection does not depend on detecting the submit button in the ChatGPT DOM
- if the engine is unavailable at paste time, the user sees an error immediately instead of discovering it at submit

## Architecture

- `apps/extension`: WXT browser extension, ChatGPT DOM adapter, popup/options UI, submit guard, response rehydration
- `packages/contracts`: source of truth for shared localhost and runtime contracts
- `services/local-engine`: FastAPI local engine, detectors, pseudonymizer, encrypted session store, CLI
- `tests/e2e`: Playwright fixture-based end-to-end workflow coverage
- `docs`: product, architecture, development, migration, and release documentation

## Environment Requirements

- Linux or macOS shell with `bash`
- `python3` `>= 3.12`
- `npm` available for bootstrap
- preferred Node runtime: `20.19.0`
- preferred pnpm version: `9.15.0`
- Chromium-compatible browser for extension development
- unsandboxed browser automation environment for Playwright e2e on Linux; if Chromium automation is blocked locally, use `PLAYWRIGHT_BROWSER=firefox`

The repository includes `.nvmrc` and `.node-version` with the required Node version. `./scripts/bootstrap.sh` can also install a repo-local Node 20 runtime and repo-local `pnpm` under `.tooling/` when the system toolchain is incomplete.

## Quickstart

1. Copy `.env.example` to `.env` if you need local overrides.
2. Run `./scripts/bootstrap.sh`.
3. Start the engine with `pnpm dev:engine` or `chatgpt-anonymizer-engine`.
4. Start the extension with `pnpm dev:extension`.
5. Load the generated WXT development build into the browser.
6. Open `chatgpt.com`, paste text into the composer, and verify the extension status pill.

## Local Development Workflow

### Bootstrap

```bash
./scripts/bootstrap.sh
```

What it does:

- provisions repo-local Node 20 and `pnpm` if needed
- installs workspace dependencies with `pnpm`
- creates `.venv/`
- installs local-engine development dependencies
- installs Playwright Chromium if not already present
- respects `PLAYWRIGHT_BROWSER` for alternative local e2e browser provisioning

### Start The Engine

```bash
pnpm dev:engine
```

Alternative:

```bash
chatgpt-anonymizer-engine --port 8765
```

### Start The Extension

```bash
pnpm dev:extension
```

### Run Both For Local Iteration

```bash
pnpm dev
```

## Testing

Run the full suite:

```bash
pnpm test
```

Run only unit/integration suites:

```bash
pnpm test:unit
```

Run only Playwright fixture e2e:

```bash
pnpm test:e2e
```

Run Playwright e2e with the Firefox fallback in sandboxed environments:

```bash
PLAYWRIGHT_BROWSER=firefox ./scripts/test.sh e2e
```

Run Python engine tests directly:

```bash
./.venv/bin/python -m pytest services/local-engine/tests/unit services/local-engine/tests/integration -q
```

## Build And Release Artifacts

Build all primary artifacts:

```bash
pnpm build
```

Artifacts produced:

- contracts build in `packages/contracts/dist/`
- unpacked extension build in `apps/extension/.output/chrome-mv3/`
- engine wheel and sdist in `services/local-engine/dist/`

Extension-specific release steps:

```bash
pnpm build:extension
pnpm build:extension:zip
```

What is currently manual:

- extension signing and store publishing
- enterprise browser policy packaging
- OS-level service installation for the local engine

## Extension Distribution Notes

- development/unpacked loading: use the WXT-generated output in `apps/extension/.output/chrome-mv3/`
- production bundle generation: run `pnpm build:extension` and `pnpm build:extension:zip`
- packaged pilot zip artifact: `apps/extension/.output/chatgpt-anonymizer-extension-0.1.0-chrome.zip`
- future signing/publishing: still manual and intentionally outside MVP scope

## Enterprise Pilot Scope

- release label: `v0.1.0-enterprise-pilot`
- code/package version carried by artifacts: `0.1.0`
- supported environment: desktop browser users on controlled enterprise-managed workstations
- supported content type: pasted text, logs, small textual files, PDF files (text layer extracted), and DOCX files surfaced through paste/drop in ChatGPT Web composers; image files and non-extractable binaries are skipped with a visible notice
- supported deployment shape: unpacked extension for pilot validation or signed extension zip for controlled distribution, plus local engine installed per-user or per-admin workflow
- required product flows for pilot:
  - paste interception and local sanitization before submit
  - submit blocking when a protected prompt becomes stale and the engine is unavailable for re-check
  - stale-after-edit submit blocking for risky changes only
  - low-confidence review drawer
  - local-only response rehydration toggle
  - per-session reset and expiry handling
- pilot operators should use:
  - [PILOT_ROLLOUT_PLAN.md](docs/development/PILOT_ROLLOUT_PLAN.md)
  - [PILOT_SMOKE_TESTS.md](docs/development/PILOT_SMOKE_TESTS.md)
  - [PILOT_ACCEPTANCE_CRITERIA.md](docs/development/PILOT_ACCEPTANCE_CRITERIA.md)
  - [PILOT_FEEDBACK_TEMPLATE.md](docs/development/PILOT_FEEDBACK_TEMPLATE.md)
  - [PILOT_EXIT_CRITERIA.md](docs/development/PILOT_EXIT_CRITERIA.md)

## Out of Scope for Pilot

- image anonymization workflows and direct attachment rewriting
- mobile browsers and non-desktop ChatGPT usage
- multi-user auth, cloud sync, or centralized mapping services
- packaged-extension loading in automated e2e as a release gate
- enterprise-wide forced rollout tooling beyond documented signing and distribution steps
- structure-aware rehydration for every rich-response widget type
- optional contextual heuristic detector UI toggle (enabled via env var only)

## Extension Signing And Distribution Checklist

- confirm release label is `v0.1.0-enterprise-pilot` and code version remains `0.1.0`
- run `./scripts/lint.sh`
- run `./scripts/test.sh unit`
- run `./scripts/build.sh extension:zip`
- verify the final zip path is `apps/extension/.output/chatgpt-anonymizer-extension-0.1.0-chrome.zip`
- verify `apps/extension/.output/chrome-mv3/manifest.json` contains the expected version and host permissions
- verify the engine artifacts exist in `services/local-engine/dist/`
- perform the smoke matrix in [PILOT_SMOKE_TESTS.md](docs/development/PILOT_SMOKE_TESTS.md)
- sign the extension with the enterprise-approved signing process for the target browser
- archive the signed extension, checksum, release notes, and pilot install instructions together
- distribute only the signed build and approved local-engine package to pilot users
- record pilot approver, artifact checksums, and rollout date in the internal release ticket

## Local Engine Packaging Notes

Build the Python package directly:

```bash
./.venv/bin/python -m build --no-isolation services/local-engine --outdir services/local-engine/dist
```

Install for a user/admin from built artifacts:

```bash
python3 -m pip install services/local-engine/dist/chatgpt_anonymizer_local_engine-*.whl
```

Uninstall:

```bash
python3 -m pip uninstall chatgpt-anonymizer-local-engine
```

## Security Controls

- localhost-only engine binding enforced through `EngineSettings`
- no remote services for sanitization or rehydration
- no logging of raw clipboard text, sanitized full text, or decrypted mappings
- encrypted session persistence with installation secret, derived session secret, and record-scoped data encryption keys
- strict extension setting validation so the engine base URL remains on `http://127.0.0.1:<port>`
- submit guard blocks stale or engine-unreachable states when a previously protected prompt needs a new local check
- rehydration is local DOM-only and reversible in the current page session
- shared contracts remain centralized in `packages/contracts`

## Known Security Limitations

- the extension cannot prevent a user from manually typing sensitive text after sanitization
- small textual files surfaced through paste/drop can be read and protected locally, but files or attachments uploaded directly into ChatGPT are not anonymized automatically
- response rehydration is still text-node based and conservative around code blocks, tables, and complex markdown widgets
- extension trust remains tied to local browser permissions and local workstation security
- duplicate-tab isolation depends on a valid browser `tabId`; fallback `tabId = 0` is weaker than the normal path

See [THREAT_MODEL.md](/home/administrator/tools/chatgpt-anonymizer/docs/product/THREAT_MODEL.md) and [SECURITY.md](/home/administrator/tools/chatgpt-anonymizer/SECURITY.md) for the fuller security review context.

## Current MVP Status

- structured composer discovery with fallback heuristics and composer fingerprinting
- submit guard modeled as explicit state machine
- tab-scoped session identity across extension and engine
- deterministic review flow reserved for genuinely ambiguous detections, with persisted decisions
- encrypted local mapping persistence
- fixture-based adapter, unit, integration, and e2e coverage
- repo-local bootstrap verified with Node `20.19.0`, pnpm `9.15.0`, and Python `3.12.3`

## Known Limitations

- detection remains text-first and primarily regex/dictionary based
- the contextual heuristic detector (`ContextualHeuristicDetector`) is a set of labeled-context regex rules for PERSON names, USERNAMEs, and custom identifiers — not a neural network model; it is disabled by default and enabled with `LOCAL_ENGINE_ENABLE_HEURISTICS=true`; a user-facing toggle is out of scope for this pilot
- Playwright e2e validates fixture workflows, not a packaged extension loaded into the browser
- local Playwright execution may require `PLAYWRIGHT_BROWSER=firefox` or a less restricted Linux environment when Chromium automation is blocked by the host sandbox
- direct attachment rewriting inside ChatGPT remains out of scope; only prompt text and text extracted during paste/drop are protected automatically

## Operational Documentation

- [docs/development/LOCAL_SETUP.md](docs/development/LOCAL_SETUP.md)
- [docs/development/ADMIN_GUIDE.md](docs/development/ADMIN_GUIDE.md)
- [docs/development/MANUAL_BROWSER_VALIDATION.md](docs/development/MANUAL_BROWSER_VALIDATION.md)
- [docs/development/MANUAL_VALIDATION_WORKSHEET.md](docs/development/MANUAL_VALIDATION_WORKSHEET.md)
- [docs/development/RELEASE_NOTES_v0.1.0-enterprise-pilot.md](docs/development/RELEASE_NOTES_v0.1.0-enterprise-pilot.md)
- [docs/development/PILOT_SMOKE_TESTS.md](docs/development/PILOT_SMOKE_TESTS.md)
- [docs/development/PILOT_ROLLOUT_PLAN.md](docs/development/PILOT_ROLLOUT_PLAN.md)
- [docs/development/PILOT_ACCEPTANCE_CRITERIA.md](docs/development/PILOT_ACCEPTANCE_CRITERIA.md)
- [docs/development/PILOT_FEEDBACK_TEMPLATE.md](docs/development/PILOT_FEEDBACK_TEMPLATE.md)
- [docs/development/PILOT_EXIT_CRITERIA.md](docs/development/PILOT_EXIT_CRITERIA.md)
- [docs/development/RUNBOOK.md](docs/development/RUNBOOK.md)
- [docs/development/TROUBLESHOOTING.md](docs/development/TROUBLESHOOTING.md)
- [docs/development/TEST_STRATEGY.md](docs/development/TEST_STRATEGY.md)
- [docs/development/RELEASE_CHECKLIST.md](docs/development/RELEASE_CHECKLIST.md)
- [docs/development/RELEASE_READINESS_REPORT.md](docs/development/RELEASE_READINESS_REPORT.md)

## Roadmap

- stronger structure-aware response rehydration for code blocks and tables
- broader ChatGPT DOM fixture coverage
- organization-specific detector packs and dictionaries
- optional desktop/service install packaging for enterprise rollout
