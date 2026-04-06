# Module Ownership

Owns the localhost FastAPI engine, detector orchestration, pseudonymization logic, encrypted persistence, CLI packaging, and session lifecycle.

## Current Phase

Feature freeze — `v0.1.0-enterprise-pilot`. See root `AGENTS.md` for the pilot hotfix protocol.

## Local Commands

- dev run: `chatgpt-anonymizer-engine`
- pytest: `./.venv/bin/python -m pytest services/local-engine/tests/unit services/local-engine/tests/integration -q`
- Ruff: `./.venv/bin/python -m ruff check services/local-engine`
- package build: `./.venv/bin/python -m build services/local-engine --outdir services/local-engine/dist`

## Responsibility Boundaries

- keep host fixed to `127.0.0.1` — no exceptions
- preserve the installation secret → session secret → record-scoped DEK model
- keep endpoint schemas aligned with `packages/contracts`
- maintain explicit session-manager invariants and encrypted-store behavior

## Known Fragilities

- optional ML detector is still a placeholder hook — do not enable it mid-pilot without a full test pass
- engine packaging is ready for wheel/sdist, but OS service automation is still external

## Do Not Touch From Here

- do not add browser/UI concerns
- do not add remote services, queues, or multi-user auth
- do not log request bodies, sanitized full text, or decrypted mappings
- do not weaken localhost binding or broaden allowed hosts
- do not change the session encryption scheme or key derivation without a security review and coordinated contracts update
- do not add new API endpoints during the pilot phase

## Minimum Tests Before Merge

- crypto roundtrip and wrong-key failure
- encrypted-store persistence
- session-manager reset, expiry, and cross-scope reuse protection
- FastAPI integration coverage for `/health`, `/sanitize`, `/revert`, `/sessions/reset`

Run: `./.venv/bin/python -m pytest services/local-engine/tests -q`

## Release Rules

- wheel and sdist must build successfully: `./.venv/bin/python -m build --no-isolation services/local-engine --outdir services/local-engine/dist`
- CLI entrypoint `chatgpt-anonymizer-engine` must remain documented and working
- engine must respond to `curl http://127.0.0.1:8765/health` with `{"status": "ok", "bind": "127.0.0.1"}`
- security docs must be updated when crypto, storage, or trust-boundary behavior changes
