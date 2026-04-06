# Implementation Review

## Current Repository State

The repository already has the right macro-shape for the product:

- a TypeScript monorepo with a dedicated contracts package
- a browser extension split across entrypoints, ChatGPT adapter code, services, and UI components
- a local FastAPI engine with detectors, pseudonymization, encrypted session storage, and tests
- documentation and AGENTS files that describe the intended local-only architecture

The MVP direction is therefore correct. The main work is no longer scaffolding but hardening the current implementation so it behaves predictably under DOM drift, repeated user actions, session churn, and iterative coding-agent maintenance.

## What Is Already Solid

- The repo boundaries are sensible: extension, contracts, engine, and e2e are separated.
- The localhost protocol already exists in a dedicated shared package.
- The engine already enforces a localhost bind configuration and avoids obvious raw-text logging.
- The detector/pseudonymization core is modular enough to iterate on.
- The initial unit tests cover important pure-engine primitives such as regex detection, replacement planning, crypto round-trip, and session persistence.
- The extension already models the core user flows: paste interception, submit blocking, low-confidence review, and response rehydration.

## What Is Fragile

### Extension / DOM

- `composerAdapter.ts` currently mixes discovery, read, write, and submit responsibilities without a clear discovery result model.
- Selector fallbacks are shallow and mostly selector-first, with limited semantic heuristics once a node is found.
- There is no explicit composer fingerprint strategy to detect DOM drift or adapter mismatches.
- The adapter tests cover only two very simple variants and do not represent more realistic nested composer structures.

### Submit Guard

- The submit guard currently exposes only a binary allow/block result plus a string reason.
- It does not model explicit states such as `never_sanitized`, `sanitized_current`, `stale_after_edit`, and `engine_unreachable`.
- The logic is partly tied to DOM orchestration and a direct health check import, which makes it harder to test as a state machine.
- The current logic still treats some changed-but-not-significant states as implicitly safe without exposing why.

### Session Management

- Extension session identity is currently stored as `tabId + conversationId` in browser storage, but the engine conversation key does not encode the tab scope. This can accidentally merge duplicated tabs into one engine mapping session.
- There is no explicit request sequencing or stale-response protection for multiple rapid paste operations.
- Review decisions are not modeled as first-class session state; part of the flow still lives ad hoc inside `content.ts`.
- Session invariants are under-documented.

### Review Flow

- Business logic for low-confidence review is spread between `content.ts` and the React component.
- The component owns decisions state, while the content script owns application logic. This makes idempotence and persistence fragile.
- Review decisions are not stored in a deterministic, reusable service layer.

### Response Rehydration

- The current overlay tracks snapshots per container but does not robustly handle repeated toggles plus subtree rerenders.
- Toggle state is not separated from container lifecycle state.
- Rehydration logic does not explicitly protect against repeated application on already rehydrated text in newly mutated subtrees.

### Engine Crypto / Store

- The key model is conceptually acceptable but under-explained in code and docs.
- `derive_mapping_key` currently collapses session context and data encryption key derivation into one ambiguous function.
- The encrypted payload format has little metadata and no explicit per-record key salt beyond the nonce.
- Store behavior around corrupted blobs, wrong keys, and persisted sessions could use stronger tests and clearer naming.

### Tests

- Extension tests do not yet cover a robust composer matrix, repeated rehydration toggles, or request race behavior.
- Existing e2e tests validate fixture harness behavior, but they do not execute the actual extension bundle. They are still valuable, but they should be documented as fixture-driven workflow tests rather than full browser-extension integration.
- There is no dedicated implementation review doc yet describing what is intentionally stubbed versus what is production-oriented.

## Gaps Versus MVP Goals

- The extension is close to MVP behavior, but robustness on `chatgpt.com` DOM variants is still insufficient.
- Per-tab/per-conversation session isolation is not fully enforced end-to-end because engine session scope is not tab-scoped yet.
- Review decisions are not modeled as stable session state.
- Response rehydration is functional but not yet hardened for repeated toggles and content rerenders.

## Gaps Versus Security Goals

- The key model needs sharper terminology to avoid future accidental misuse.
- Session persistence behavior needs more explicit tests for wrong-key and corrupted-blob scenarios.
- Raw sensitive text is not logged, but the code should make that invariant more explicit in AGENTS and threat-model docs.
- The extension should avoid storing avoidable sensitive transient state. Review flow must keep raw text in memory only where strictly necessary.

## Gaps Versus Testability

- Submit guard should be a pure state machine with dependency injection for engine health checks.
- Review application logic should move into a pure service that can be tested without React or DOM.
- Composer discovery should expose deterministic metadata and fingerprinting so tests can assert which variant was discovered.

## Gaps Versus Robustness On chatgpt.com

- Missing composer fingerprinting means DOM drift can silently degrade behavior.
- Fallback heuristics should consider nested `contenteditable` structures and semantic form relationships more explicitly.
- The adapter should return structured discovery information, not only raw nodes.

## Prioritized Corrective Actions

1. Refactor the composer adapter into explicit discovery/read/write/clear/submit layers with a composer fingerprint and richer heuristics.
2. Replace the submit guard binary check with a small explicit state machine and add focused unit tests for all guard states.
3. Harden extension session management with a tab-scoped engine conversation key, request sequencing, expiry checks, and documented invariants.
4. Move low-confidence review business logic into a dedicated service/hook and persist deterministic review decisions in the current session state.
5. Harden response rehydration to handle repeated toggles and subtree rerenders without double substitution.
6. Clarify the engine key model, add a stronger encrypted payload format with explicit derivation context, and extend crypto/store tests.
7. Update AGENTS, README, threat model, and test strategy so they reflect the real implementation status and known fragilities.

## Hardening Applied In This Iteration

- Composer integration now exposes structured discovery metadata, explicit read/write/clear/submit operations, and a composer fingerprint that can detect DOM drift between sanitization and submit.
- Selector heuristics are centralized and covered by fixture-based tests for semantic `contenteditable`, `textarea`, and nested editable variants.
- The submit guard is now a small explicit state machine with deterministic states and injectable health checks.
- Extension session scope is now tab-aware end to end, including popup reset behavior, browser storage keys, and engine conversation identity.
- Rapid consecutive paste operations are sequenced so stale sanitize responses do not overwrite newer results.
- Low-confidence review business logic moved out of the React drawer into a dedicated service with idempotent apply semantics from the original text baseline.
- Response rehydration now tracks per-container toggle state and reapplies safely after subtree rerenders without double substitution.
- The engine key model is more explicit: installation secret on disk, derived session secret in memory, and record-scoped DEK per encrypted blob.
- Engine persistence tests now cover encrypted-store persistence and wrong-key failure, and session-manager behavior now prevents accidental session-id reuse across conversation scopes.

## Remaining High-Priority Gaps

- The extension still depends on browser runtime `tabId`; fallback behavior when that id is unavailable is safe but weaker than the normal scope model.
- Rehydration remains intentionally conservative and text-node based. Complex markdown, code blocks, and tables still need a future structure-aware strategy.
- Playwright e2e is still fixture-driven rather than running the packaged extension bundle inside the browser.
- Full TypeScript test execution and packaged-extension validation require a local Node 20 plus pnpm environment.
