# Architecture Overview

## System Shape

The repository is a monorepo with three runtime boundaries:

- browser extension runtime for UX and DOM control
- localhost API contract package for payload validation and shared semantics
- Python local engine for detection, pseudonymization, storage, and reversion

## Request Path

1. `content.ts` detects a paste or drop event.
2. `composerAdapter.ts` extracts normalized plain text from the active composer.
3. `localEngineClient.ts` calls `POST /sanitize`.
4. The local engine runs registered detectors, resolves overlaps, generates placeholders, encrypts mapping state, and returns a response.
5. The extension updates the composer, state store, and review UI.
6. `submitGuard.ts` validates that the current composer content still matches the last sanitization state before submit.

## Session Model

- one engine session per conversation/tab key
- deterministic placeholders within a session
- encrypted session payload persisted in a local data directory
- configurable TTL with reset support from popup

## Storage Model

- extension stores only workflow metadata and settings
- engine stores reversible mapping encrypted at rest
- rehydration state remains in page memory only

## Failure Behavior

- engine down: submit blocked
- stale sanitized state: submit blocked until re-sanitization
- low-confidence findings: review drawer opened, but safe defaults remain visible
