# Repository Agent Guide

## Current Phase

This repository is in **controlled enterprise pilot** phase: `v0.1.0-enterprise-pilot`.

**Feature freeze is in effect.** No new features may be merged during the pilot. Only critical bug fixes are accepted — see "Pilot Hotfix Protocol" below.

## Repository Mission

Maintain an extension-first local anonymization product for ChatGPT Web. The extension sanitizes pasted text before submit using a **Paste-First** strategy, the local engine runs only on `127.0.0.1`, mappings stay local and encrypted, and response rehydration remains local to the user DOM.

## Ownership

- `apps/extension`: browser UX, DOM adapter, popup/options, session metadata (see `apps/extension/AGENTS.md`)
- `packages/contracts`: source of truth for shared contracts
- `services/local-engine`: FastAPI engine, crypto, session store, detectors (see `services/local-engine/AGENTS.md`)
- `tests/e2e`: fixture-based workflow verification
- `docs/development/`: operational, pilot, and release documentation

## Local Commands

- bootstrap: `./scripts/bootstrap.sh`
- dev all: `pnpm dev`
- lint: `pnpm lint`
- unit/integration tests: `pnpm test:unit`
- full test suite: `pnpm test`
- release artifacts: `pnpm build`

## Sensitive Areas — Extra Care Required

### Paste flow (`apps/extension/src/chatgpt/pasteInterceptor.ts`)

The paste-first strategy is the core protection mechanism. Every text paste must be:
1. intercepted (preventing native paste with `preventDefault()`)
2. sanitized by the local engine
3. written back to the composer
4. verified with a read-back comparison

Do not add bypass paths. Do not skip the write-back verification. Do not modify the IME composition guard without understanding the full compositionstart/compositionend lifecycle.

### Composer adapter (`apps/extension/src/chatgpt/composerAdapter.ts`)

Handles reading and writing text to the ChatGPT editor DOM. Changes here can silently break the paste flow. Always run the full composer adapter test suite after any change.

### Submit guard (`apps/extension/src/chatgpt/submitGuard.ts`)

Guards submit for manually typed text. Must not fail open (allow submit when it should block). The broadened click detection fallback (`looksLikeSubmitButton` on the clicked element) is intentional — it covers ChatGPT DOM changes where `findSubmitButton()` returns null.

### Selector strategies (`apps/extension/src/chatgpt/selectors.ts`)

Contains layered DOM discovery strategies. Both strict (with `<form>` context) and loose (without `<form>`) strategies are needed. Do not remove loose strategies — they cover ChatGPT DOM changes.

### Contracts (`packages/contracts/src/`)

Source of truth for all request/response types between the extension and the engine. Any schema change requires synchronized updates in both the extension and the engine.

### Local engine localhost binding

The engine must always bind to `127.0.0.1` only. This is a non-negotiable security control.

## Security Rules

- keep the engine bound to `127.0.0.1` only
- never log raw clipboard text, sanitized full text, or decrypted mappings
- never introduce remote processing, telemetry, analytics, or cloud inference for sensitive text
- keep extension settings restricted to `http://127.0.0.1:<port>`
- preserve encrypted mapping persistence and the explicit key hierarchy

## Minimum Tests Before Any Merge

```bash
# Full suite — must all pass
pnpm test

# Minimum for hotfixes
pnpm test:unit
```

For changes to the paste flow, composer adapter, submit guard, or selectors — run the full suite including e2e.

## Pilot Hotfix Protocol

1. Branch from the pilot release tag: `git checkout -b hotfix/description v0.1.0-enterprise-pilot`
2. Make the minimal fix. No refactors, no unrelated cleanup.
3. Run `pnpm test` — all tests must pass.
4. Update `CHANGELOG.md` with a patch entry.
5. Update `RELEASE_NOTES_v0.1.0-enterprise-pilot.md` if the fix affects pilot user experience.
6. After merge, rebuild artifacts and re-run the smoke matrix.

## What A Critical Pilot Bug Fix Looks Like

- paste sanitization stops working (original text appears in composer)
- submit guard fails open when engine is unreachable
- engine starts binding on a non-localhost interface
- extension crashes on load or causes a browser crash
- raw text appears in logs

All other issues are `major` or `minor` — recorded in the pilot findings log but not hotfixed mid-wave.

## Modification Boundaries

- update `packages/contracts` first when shared payloads change
- update docs in the same PR when security, packaging, or operational behavior changes
- keep UI logic separate from business logic
- keep selectors in `apps/extension/src/chatgpt/selectors.ts`
- keep release artifacts reproducible through scripts and CI

## Known Fragilities

- ChatGPT DOM can drift and break selectors — loose fallback strategies are the mitigation
- packaged-extension-in-browser coverage is still weaker than fixture-based workflow coverage
- response rehydration remains conservative on code blocks, tables, and complex markdown
- duplicate-tab isolation depends on a valid browser `tabId`
- IME composition flows (Japanese, Chinese, Korean) implemented but not yet validated with real pilot users

## Do Not

- do not add new features, detection entity types, or API endpoints during the pilot
- do not add new npm or Python dependencies without security review
- do not add new browser permissions to the extension manifest
- do not change the session encryption scheme
- do not reintroduce Redis, Celery, nginx, LDAP auth, multi-user auth, batch review flows, or remote services
- do not bypass the submit guard when the engine is unreachable
- do not move sensitive text through GitHub Actions artifacts or public issue reports
- do not change the engine port default or the localhost binding

## Release Rules

- CI workflows must stay green across contracts/extension, engine, e2e, and release-readiness
- release artifacts must include extension output and engine wheel/sdist
- README, SECURITY, runbook, checklist, and readiness report must reflect the actual repo state
- `RELEASE_CHECKLIST.md` must be completed before any distribution

## Definition Of Done (Pilot Phase)

- code, docs, and contracts are aligned
- no new sensitive logging was introduced
- relevant unit/integration/e2e coverage was updated or verified unchanged
- bootstrap, build, and test paths remain operational
- known caveats are documented rather than hidden
- `pnpm test` passes in full
